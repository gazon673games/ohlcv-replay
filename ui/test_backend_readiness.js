const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const vm = require("node:vm");

function desktopContext(overrides = {}) {
  let start;
  const errors = [];
  const app = {
    isPackaged: false,
    whenReady: () => ({ then: callback => { start = callback; } }),
    on: () => {},
    getPath: () => __dirname,
    exit: code => { app.exitCode = code; },
  };
  const context = vm.createContext({
    __dirname,
    process: { env: {}, platform: process.platform, stderr: { write: text => errors.push(text) } },
    setTimeout,
    require: name => {
      if (name === "electron") return { app, dialog: { showErrorBox: () => {} } };
      if (name === "./settings") return { loadSettings: () => ({ server: { host: "127.0.0.1" } }) };
      if (name in overrides) return overrides[name];
      return require(name);
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "main.js"), "utf8"), context);
  return { context, app, errors, start: () => start() };
}

async function main() {
  const { context } = desktopContext();
  let status = 200;
  let body = JSON.stringify({ service: "ohlcv-replay-workbench", status: "ready" });
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    if (request.url !== "/api/health") {
      // A history scan exceeding the old 500 ms timeout must never gate startup.
      setTimeout(() => response.end('{"runs":[]}'), 750);
      return;
    }
    response.writeHead(status);
    response.end(body);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    assert.equal(await context.probeWorkbench(port), true);
    body = '{"runs":[]}';
    assert.equal(await context.probeWorkbench(port), false);
    body = '{"service":"another-app","status":"ready"}';
    assert.equal(await context.probeWorkbench(port), false);
    body = '{"service":"ohlcv-replay-workbench","status":"starting"}';
    assert.equal(await context.probeWorkbench(port), false);
    body = "invalid JSON";
    assert.equal(await context.probeWorkbench(port), false);
    status = 503;
    body = '{"service":"ohlcv-replay-workbench","status":"ready"}';
    assert.equal(await context.probeWorkbench(port), false);
    assert.ok(requests.every(route => route === "/api/health"));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  assert.equal(await context.probeWorkbench(port), false);

  const failed = desktopContext({
    "node:fs": { mkdirSync: () => { throw new Error("log directory unavailable"); } },
  });
  await failed.start();
  assert.equal(failed.app.exitCode, 1);
  assert.match(failed.errors.join(""), /Workbench startup failed:.*log directory unavailable/);

  const launcherErrors = [];
  for (const [result, expected] of [
    [{ status: 0 }, 0], [{ status: 7 }, 7], [{ status: null, signal: "SIGTERM" }, 1],
  ]) {
    let exitCode;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "run-electron.js"), "utf8"), {
      require: name => name === "electron" ? "electron.exe" : { spawnSync: () => result },
      process: { env: {}, argv: [], exit: code => { exitCode = code; },
        stderr: { write: text => launcherErrors.push(text) } },
    });
    assert.equal(exitCode, expected);
  }
  assert.match(launcherErrors.join(""), /Electron terminated by SIGTERM/);
  console.log("backend readiness and startup failure tests passed");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
