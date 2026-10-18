const fs = require("node:fs");
const path = require("node:path");

const DEFAULTS = {
  server: {
    host: "127.0.0.1",
    port: 8765,
    port_scan_limit: 100,
    startup_timeout_ms: 120000,
  },
  jobs: { max_concurrency: 2 },
  strategies: { sdk_catalog_path: null },
  paths: {
    data_root: "data/workbench",
    runs_directory: "runs",
    datasets_directory: "datasets",
    packaged_data_directory: "workbench",
  },
  desktop: {
    width: 1440,
    height: 920,
    min_width: 980,
    min_height: 680,
    log_file: "workbench.log",
  },
  proxy: {
    enabled: false,
    url: "localhost:10808",
    adapter_ids: [],
    all_adapters: false,
  },
};

function loadSettings(app, projectRoot) {
  let settingsPath = process.env.WORKBENCH_SETTINGS_PATH
    ? path.resolve(process.env.WORKBENCH_SETTINGS_PATH)
    : app.isPackaged
      ? path.join(process.resourcesPath, "settings", "workbench.json")
      : path.join(projectRoot, "settings", "workbench.json");
  const localPath = path.join(path.dirname(settingsPath), "workbench.local.json");
  if (!process.env.WORKBENCH_SETTINGS_PATH && fs.existsSync(localPath)) settingsPath = localPath;
  if (!fs.existsSync(settingsPath)) return structuredClone(DEFAULTS);
  const configured = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  const settings = mergeSettings(DEFAULTS, configured);
  if (settings.strategies.sdk_catalog_path) {
    settings.strategies.sdk_catalog_path = path.resolve(
      path.dirname(settingsPath), settings.strategies.sdk_catalog_path,
    );
  }
  return settings;
}

function mergeSettings(defaults, configured) {
  return Object.fromEntries(Object.entries(defaults).map(([section, values]) => [
    section,
    { ...values, ...(configured[section] || {}) },
  ]));
}

module.exports = { loadSettings };
