const assert = require("node:assert/strict");
function createWindow(BrowserWindow) {
  const width = Number(process.env.WORKBENCH_SMOKE_WIDTH || "1440");
  const height = Number(process.env.WORKBENCH_SMOKE_HEIGHT || "1000");
  return new BrowserWindow({ width, height, show: false,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } });
}
async function showWindow(window) {
  if (process.env.WORKBENCH_SMOKE_SHOW === "1") window.show();
  else { window.setPosition(-10000, -10000); window.showInactive(); }
  const width = Number(process.env.WORKBENCH_SMOKE_WIDTH || "1440");
  const height = Number(process.env.WORKBENCH_SMOKE_HEIGHT || "1000");
  let viewport;
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 150));
    viewport = await window.webContents.executeJavaScript(`({ width: innerWidth, height: innerHeight })`);
    if (viewport.width === width && viewport.height === height) break;
    const bounds = window.getBounds();
    window.setBounds({ width: bounds.width + width - viewport.width, height: bounds.height + height - viewport.height });
  }
  assert.equal(viewport.width, width);
  assert.equal(viewport.height, height);
  process.stdout.write(`verified CSS viewport: ${JSON.stringify(viewport)}\n`);
}
module.exports = { createWindow, showWindow };
