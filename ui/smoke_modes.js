const fs = require("node:fs");
const path = require("node:path");
async function captureModes(window) {
  if (process.env.WORKBENCH_SMOKE_CAPTURE_MODES !== "1") return;
  const base = path.parse(process.env.WORKBENCH_SMOKE_SCREENSHOT || path.join(__dirname, "../data/workbench/ui-smoke.png"));
  const capture = async mode => {
    await new Promise(resolve => setTimeout(resolve, 150));
    fs.writeFileSync(path.join(base.dir, `${base.name}-${mode}.png`), (await window.webContents.capturePage()).toPNG());
  };
  await capture("trades");
  await window.webContents.executeJavaScript(`WorkbenchWorkspace.toggleEditor()`);
  await capture("editor");
  await window.webContents.executeJavaScript(`WorkbenchCore.showView("tradesView")`);
}
module.exports = { captureModes };
