const fs = require("node:fs");
const path = require("node:path");

const desktopRoot = __dirname;
const vendorRoot = path.resolve(desktopRoot, "web", "vendor");

copyDirectory(
  path.join(desktopRoot, "node_modules", "monaco-editor", "min", "vs"),
  path.join(vendorRoot, "monaco", "vs"),
  "Monaco",
  packageVersion("monaco-editor"),
);
copyFile(
  path.join(
    desktopRoot,
    "node_modules",
    "lightweight-charts",
    "dist",
    "lightweight-charts.standalone.production.js",
  ),
  path.join(vendorRoot, "lightweight-charts", "lightweight-charts.js"),
  "Lightweight Charts",
  packageVersion("lightweight-charts"),
);

function copyDirectory(source, target, label, version) {
  assertSource(source, label);
  assertVendorTarget(target, label);
  const marker = path.join(target, ".prepared-version");
  if (assetIsCurrent(target, marker, version)) {
    process.stdout.write(`Local ${label} assets are current (${version})\n`);
    return;
  }
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
  fs.writeFileSync(marker, version);
  process.stdout.write(`Prepared local ${label} assets at ${target}\n`);
}

function copyFile(source, target, label, version) {
  assertSource(source, label);
  assertVendorTarget(target, label);
  const marker = `${target}.prepared-version`;
  if (assetIsCurrent(target, marker, version)) {
    process.stdout.write(`Local ${label} asset is current (${version})\n`);
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  fs.writeFileSync(marker, version);
  process.stdout.write(`Prepared local ${label} asset at ${target}\n`);
}

function assetIsCurrent(target, marker, version) {
  return fs.existsSync(target)
    && fs.existsSync(marker)
    && fs.readFileSync(marker, "utf8") === version;
}

function packageVersion(packageName) {
  const manifest = path.join(desktopRoot, "node_modules", packageName, "package.json");
  assertSource(manifest, packageName);
  return JSON.parse(fs.readFileSync(manifest, "utf8")).version;
}

function assertSource(source, label) {
  if (!fs.existsSync(source)) {
    throw new Error(`${label} source not found: ${source}. Run npm install first.`);
  }
}

function assertVendorTarget(target, label) {
  if (!target.startsWith(vendorRoot + path.sep)) {
    throw new Error(`Refusing to replace unexpected ${label} target: ${target}`);
  }
}
