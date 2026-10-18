const { spawnSync } = require("node:child_process");
const path = require("node:path");

const desktopRoot = __dirname;
const projectRoot = path.resolve(desktopRoot, "..");
const backendRoot = path.join(projectRoot, "backtest_engine");
const buildRoot = path.join(projectRoot, "build", "desktop-backend");
const webRoot = path.join(desktopRoot, "web");
const result = spawnSync(
  process.env.WORKBENCH_UV_COMMAND || "uv",
  [
    "run",
    "--project",
    backendRoot,
    "--with",
    "pyinstaller",
    "pyinstaller",
    "--noconfirm",
    "--clean",
    "--onedir",
    "--name",
    "backtest-workbench-server",
    "--distpath",
    path.join(buildRoot, "dist"),
    "--workpath",
    path.join(buildRoot, "work"),
    "--specpath",
    path.join(buildRoot, "spec"),
    "--paths",
    path.join(backendRoot, "src"),
    "--additional-hooks-dir",
    path.join(desktopRoot, "hooks"),
    "--collect-data",
    "backtest_engine",
    "--add-data",
    `${webRoot}${path.delimiter}backtest_engine/workbench/static`,
    "--hidden-import",
    "backtest_engine.workbench.research",
    "--hidden-import",
    "backtest_engine.workbench.dataset_jobs",
    path.join(desktopRoot, "backend_entry.py"),
  ],
  { cwd: desktopRoot, stdio: "inherit", windowsHide: true },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
