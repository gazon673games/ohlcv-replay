const fs = require("node:fs");
const path = require("node:path");

function developmentBackendLaunch(root, serverArgs, env = process.env, platform = process.platform) {
  const override = String(env.WORKBENCH_UV_COMMAND || "").trim();
  if (override) return uvLaunch(override, root, serverArgs);

  const uvCommand = findOnPath("uv", env, platform);
  if (uvCommand) return uvLaunch(uvCommand, root, serverArgs);

  const projectCommand = path.join(
    root,
    ".venv",
    platform === "win32" ? "Scripts" : "bin",
    platform === "win32" ? "backtest.exe" : "backtest",
  );
  if (isExecutable(projectCommand, platform)) {
    return { command: projectCommand, args: ["workbench-serve", ...serverArgs] };
  }

  throw new Error(
    `Cannot start Workbench backend: uv and ${projectCommand} were not found. `
      + "Run uv sync in backtest_engine or set WORKBENCH_UV_COMMAND to the uv executable.",
  );
}

function uvLaunch(command, root, serverArgs) {
  return {
    command,
    args: ["run", "--project", root, "backtest", "workbench-serve", ...serverArgs],
  };
}

function findOnPath(command, env, platform) {
  const rawPath = env.PATH || env.Path || env.path || "";
  const delimiter = platform === "win32" ? ";" : ":";
  const extensions = platform === "win32"
    ? executableExtensions(env.PATHEXT)
    : [""];
  for (const rawDirectory of rawPath.split(delimiter)) {
    const directory = rawDirectory.trim().replace(/^"|"$/g, "");
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
      if (isExecutable(candidate, platform)) return candidate;
    }
  }
  return null;
}

function executableExtensions(rawValue) {
  const values = String(rawValue || ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  values.unshift("");
  return values;
}

function isExecutable(candidate, platform) {
  try {
    if (!fs.statSync(candidate).isFile()) return false;
    if (platform !== "win32") fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

module.exports = { developmentBackendLaunch, findOnPath };
