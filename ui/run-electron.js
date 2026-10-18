const { spawnSync } = require("node:child_process");
const electron = require("electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(electron, process.argv.slice(2), {
  env,
  stdio: "inherit",
  windowsHide: false,
});

if (result.error) throw result.error;
if (result.signal) process.stderr.write(`Electron terminated by ${result.signal}\n`);
process.exit(result.status ?? 1);
