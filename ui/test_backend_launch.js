const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { developmentBackendLaunch } = require("./backend-launch");
const { loadSettings } = require("./settings");

const temporaryRoots = [];
const previousSettingsPath = process.env.WORKBENCH_SETTINGS_PATH;

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ohlcv-backend-launch-"));
  temporaryRoots.push(root);
  return root;
}

function touch(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "");
  return target;
}

try {
  delete process.env.WORKBENCH_SETTINGS_PATH;
  const explicit = developmentBackendLaunch(
    "C:\\project\\backtest_engine",
    ["--port", "8765"],
    { WORKBENCH_UV_COMMAND: "C:\\tools\\uv.exe", PATH: "" },
    "win32",
  );
  assert.equal(explicit.command, "C:\\tools\\uv.exe");
  assert.deepEqual(explicit.args.slice(0, 4), [
    "run", "--project", "C:\\project\\backtest_engine", "backtest",
  ]);

  const pathRoot = temporaryRoot();
  const uvPath = touch(path.join(pathRoot, "uv.exe"));
  const discovered = developmentBackendLaunch(
    "C:\\project\\backtest_engine",
    [],
    { PATH: pathRoot, PATHEXT: ".EXE" },
    "win32",
  );
  assert.equal(discovered.command, uvPath);

  const projectRoot = temporaryRoot();
  const backtestPath = touch(path.join(projectRoot, ".venv", "Scripts", "backtest.exe"));
  const fallback = developmentBackendLaunch(
    projectRoot,
    ["--host", "127.0.0.1"],
    { PATH: "" },
    "win32",
  );
  assert.equal(fallback.command, backtestPath);
  assert.deepEqual(fallback.args, ["workbench-serve", "--host", "127.0.0.1"]);

  assert.throws(
    () => developmentBackendLaunch(temporaryRoot(), [], { PATH: "" }, "win32"),
    /Run uv sync in backtest_engine/,
  );
  const settingsRoot = temporaryRoot();
  const settingsDirectory = path.join(settingsRoot, "settings");
  fs.mkdirSync(settingsDirectory);
  const baseSettings = path.join(settingsDirectory, "workbench.json");
  fs.writeFileSync(baseSettings, JSON.stringify({ strategies: { sdk_catalog_path: "../catalog" } }));
  const app = { isPackaged: false };
  assert.equal(loadSettings(app, settingsRoot).strategies.sdk_catalog_path,
    path.join(settingsRoot, "catalog"));
  const localSettings = path.join(settingsDirectory, "workbench.local.json");
  fs.writeFileSync(localSettings, JSON.stringify({ strategies: { sdk_catalog_path: "../local" } }));
  assert.equal(loadSettings(app, settingsRoot).strategies.sdk_catalog_path,
    path.join(settingsRoot, "local"));
  process.env.WORKBENCH_SETTINGS_PATH = baseSettings;
  assert.equal(loadSettings(app, settingsRoot).strategies.sdk_catalog_path,
    path.join(settingsRoot, "catalog"));
  console.log("backend launch and catalog settings tests passed");
} finally {
  if (previousSettingsPath === undefined) delete process.env.WORKBENCH_SETTINGS_PATH;
  else process.env.WORKBENCH_SETTINGS_PATH = previousSettingsPath;
  for (const root of temporaryRoots) fs.rmSync(root, { recursive: true, force: true });
}
