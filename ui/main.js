const { app, BrowserWindow, dialog } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { developmentBackendLaunch } = require("./backend-launch");
const { loadSettings } = require("./settings");

const projectRoot = path.resolve(__dirname, "..");
const settings = loadSettings(app, projectRoot);
const host = process.env.WORKBENCH_HOST || settings.server.host;
const requestedPort = Number(process.env.WORKBENCH_PORT || settings.server.port);
const fixedPort = Boolean(process.env.WORKBENCH_PORT);
let port = requestedPort;
let serverProcess = null;
let serverFailure = null;
let logStream = null;

function backendRoot() {
  if (process.env.OHLCV_REPLAY_ROOT) return path.resolve(process.env.OHLCV_REPLAY_ROOT);
  if (app.isPackaged) return path.join(process.resourcesPath, "backend");
  return path.join(projectRoot, "backtest_engine");
}

function workbenchDataRoot() {
  if (process.env.WORKBENCH_DATA_ROOT) return path.resolve(process.env.WORKBENCH_DATA_ROOT);
  if (app.isPackaged) {
    return path.join(app.getPath("userData"), settings.paths.packaged_data_directory);
  }
  return path.resolve(projectRoot, settings.paths.data_root);
}

function openLog() {
  const logDir = app.getPath("logs");
  fs.mkdirSync(logDir, { recursive: true });
  logStream = fs.createWriteStream(path.join(logDir, settings.desktop.log_file), { flags: "a" });
  writeLog(`desktop starting packaged=${app.isPackaged}`);
}

function writeLog(message) {
  if (logStream) logStream.write(`[${new Date().toISOString()}] ${message}\n`);
}

function startServer() {
  const root = backendRoot();
  const outputRoot = path.join(workbenchDataRoot(), settings.paths.runs_directory);
  fs.mkdirSync(outputRoot, { recursive: true });
  const launch = serverLaunch(root, outputRoot);
  serverProcess = spawn(
    launch.command,
    launch.args,
    {
      cwd: root,
      env: {
        ...process.env,
        BACKTEST_NODE_BINARY: app.isPackaged
          ? process.execPath
          : process.env.BACKTEST_NODE_BINARY,
        BACKTEST_NODE_RUN_AS_NODE: app.isPackaged ? "1" : "0",
        WORKBENCH_MAX_JOBS:
          process.env.WORKBENCH_MAX_JOBS || String(settings.jobs.max_concurrency),
        WORKBENCH_SDK_CATALOG_PATH:
          process.env.WORKBENCH_SDK_CATALOG_PATH ?? settings.strategies.sdk_catalog_path ?? "",
        WORKBENCH_STATIC_ROOT:
          process.env.WORKBENCH_STATIC_ROOT || (app.isPackaged ? "" : path.join(__dirname, "web")),
        UV_PROJECT_ENVIRONMENT:
          process.env.UV_PROJECT_ENVIRONMENT || path.join(app.getPath("userData"), "python-env"),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  serverProcess.stdout.pipe(logStream, { end: false });
  serverProcess.stderr.pipe(logStream, { end: false });
  serverProcess.on("error", (error) => {
    serverFailure = error;
    writeLog(`server spawn failed: ${error.stack || error}`);
  });
  serverProcess.on("exit", (code, signal) => {
    if (code) serverFailure = new Error(`Workbench server exited with code ${code}`);
    writeLog(`server exited code=${code} signal=${signal}`);
  });
  writeLog(`server spawned at http://${host}:${port}`);
}

function serverLaunch(root, outputRoot) {
  const serverArgs = [
    "--host", host,
    "--port", String(port),
    "--output-root", outputRoot,
  ];
  if (app.isPackaged) {
    const executable = process.platform === "win32"
      ? "backtest-workbench-server.exe"
      : "backtest-workbench-server";
    return { command: path.join(root, executable), args: serverArgs };
  }
  return developmentBackendLaunch(root, serverArgs);
}

async function resolveServerPort() {
  const lastPort = requestedPort + settings.server.port_scan_limit;
  for (let candidate = requestedPort; candidate < lastPort; candidate += 1) {
    if (await canListen(candidate)) return candidate;
    if (fixedPort) throw new Error(`WORKBENCH_PORT ${candidate} is already in use`);
  }
  throw new Error("No free workbench port found");
}

function canListen(candidate) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(candidate, host, () => server.close(() => resolve(true)));
  });
}

function probeWorkbench(candidate) {
  return new Promise((resolve) => {
    // Readiness must stay independent of the number of saved runs.
    const request = http.get(`http://${host}:${candidate}/api/health`, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          const payload = JSON.parse(body);
          resolve(response.statusCode === 200
            && payload.service === "ohlcv-replay-workbench" && payload.status === "ready");
        } catch {
          resolve(false);
        }
      });
    });
    request.setTimeout(1000, () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

async function waitForServer() {
  const timeoutMs = settings.server.startup_timeout_ms;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeWorkbench(port)) return;
    if (serverFailure) throw serverFailure;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Workbench server did not start within ${timeoutMs / 1000} seconds`);
}

async function createWindow() {
  const win = new BrowserWindow({
    width: settings.desktop.width,
    height: settings.desktop.height,
    minWidth: settings.desktop.min_width,
    minHeight: settings.desktop.min_height,
    title: "OHLCV Replay Workbench",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await win.loadURL(`http://${host}:${port}`);
}

function stopServer() {
  if (!serverProcess || serverProcess.killed) return;
  if (process.platform === "win32") {
    const killer = spawn(
      "taskkill",
      ["/pid", String(serverProcess.pid), "/t", "/f"],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    killer.unref();
  } else {
    serverProcess.kill("SIGTERM");
  }
  serverProcess = null;
}

app.whenReady().then(async () => {
  try {
    openLog();
    port = await resolveServerPort();
    startServer();
    await waitForServer();
    await createWindow();
  } catch (error) {
    writeLog(error.stack || String(error));
    process.stderr.write(`Workbench startup failed: ${error.stack || error}\n`);
    dialog.showErrorBox("OHLCV Replay Workbench", error.message || String(error));
    stopServer();
    if (logStream) logStream.end();
    app.exit(1);
  }
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => {
  stopServer();
  if (logStream) logStream.end();
});
