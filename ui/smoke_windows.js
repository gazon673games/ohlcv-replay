const assert = require("node:assert/strict");
const { verifyWindowInteractions } = require("./smoke_window_interactions");
const { verifyUnboundedWorkspace } = require("./smoke_unbounded_windows");

async function verifyFloatingWorkspace(window) {
  const initial = await window.webContents.executeJavaScript(`(async () => {
    const check = (v, message) => { if (!v) throw new Error(message); };
    WorkbenchWorkspace.openPanel("data"); WorkbenchWorkspace.openPanel("strategy");
    WorkbenchCore.showView("jobsView");
    check(["data", "strategy", "jobsView"].every(id => WorkbenchWindows.get(id).visible), "windows remain exclusive");
    const draft = WorkbenchEditor.getSource();
    WorkbenchWindows.hide("strategy"); WorkbenchWindows.show("strategy");
    check(WorkbenchEditor.getSource() === draft, "window minimize lost editor draft");
    WorkbenchWindows.maximize("strategy");
    check(WorkbenchWindows.get("strategy").maximized, "maximize failed");
    WorkbenchWindows.maximize("strategy");
    const win = WorkbenchWindows.get("strategy");
    win.header.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    const stored = JSON.parse(localStorage.getItem("workbench.windows.v1"));
    check(stored.strategy.rect.x === win.rect.x, "window position was not persisted");
    const candle = i => ({ ts: new Date(Date.UTC(2025, 0, 1, i)).toISOString(), open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i });
    const chartA = WorkbenchMultiChart.open({ asset_id: "A", candles: [0, 1, 2].map(candle), fills: [] });
    const chartB = WorkbenchMultiChart.open({ asset_id: "B", candles: [0, 1].map(candle), fills: [] });
    await new Promise(resolve => setTimeout(resolve, 100));
    check(WorkbenchMultiChart.stats().find(c => c.id === chartA).rows === 3, "first chart has wrong data");
    check(WorkbenchMultiChart.stats().find(c => c.id === chartB).rows === 2, "chart state was shared");
    WorkbenchWindows.remove(chartA); WorkbenchWindows.remove(chartB);
    check(WorkbenchMultiChart.stats().length === 0, "closed charts leaked instances");
    WorkbenchWindows.show("portfolio");
    check(document.getElementById("portfolioPanel") && WorkbenchWindows.get("portfolio").visible, "portfolio window unavailable");
    WorkbenchWindows.hide("portfolio"); WorkbenchWindows.hide("strategy"); WorkbenchWindows.hide("jobsView");
    const market = WorkbenchWindows.get("market");
    return { x: market.rect.x, y: market.rect.y, left: market.node.getBoundingClientRect().left,
      top: market.node.getBoundingClientRect().top, width: market.rect.width, height: market.rect.height };
  })()`);
  window.webContents.sendInputEvent({ type: "mouseDown", button: "left", x: Math.round(initial.left + 60), y: Math.round(initial.top + 14), clickCount: 1 });
  window.webContents.sendInputEvent({ type: "mouseMove", x: Math.round(initial.left + 80), y: Math.round(initial.top + 34) });
  window.webContents.sendInputEvent({ type: "mouseUp", button: "left", x: Math.round(initial.left + 80), y: Math.round(initial.top + 34), clickCount: 1 });
  await new Promise(resolve => setTimeout(resolve, 100));
  const moved = await window.webContents.executeJavaScript('WorkbenchWindows.get("market").rect');
  assert.equal(moved.x, initial.x + 20); assert.equal(moved.y, initial.y + 20);
  const restored = await window.webContents.executeJavaScript(`(() => {
    WorkbenchWindows.arrange();
    return { windows: document.querySelectorAll(".workbench-window").length, charts: WorkbenchMultiChart.stats().length };
  })()`);
  assert.ok(restored.windows >= 10); assert.equal(restored.charts, 0);
  await verifyWindowInteractions(window);
  await verifyUnboundedWorkspace(window);
  process.stdout.write("floating windows, pointer dragging, independent charts and disposal passed\n");
}
async function verifyPortfolioRun(window) {
  const id = process.env.WORKBENCH_SMOKE_PORTFOLIO_PRESET;
  if (!id) return;
  const result = await window.webContents.executeJavaScript(`(async () => {
    const check = (v, message) => { if (!v) throw new Error(message); };
    const preset = (await WorkbenchApi.get("/api/portfolios")).items.find(item => item.preset_id === ${JSON.stringify(id)});
    check(preset, "portfolio preset not found");
    WorkbenchPortfolioUI.render(preset); WorkbenchWindows.show("portfolio");
    document.getElementById("portfolioRunButton").click();
    await new Promise(resolve => setTimeout(resolve, 100));
    const deadline = Date.now() + 180000;
    while (WorkbenchCore.state.runBusy && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100));
    check(!WorkbenchCore.state.runBusy, "portfolio run timed out");
    const error = document.querySelector(".portfolio-error").textContent;
    check(!error, error);
    const report = WorkbenchCore.state.lastReport;
    check(report?.kind === "portfolio", "portfolio did not render its report");
    check(WorkbenchMultiChart.stats().length === preset.config.legs.length, "portfolio charts are incomplete");
    check(report.assets.every(asset => WorkbenchWindows.get("portfolio-chart-" + asset.asset_id).visible), "portfolio chart hidden");
    check(WorkbenchWindows.get("portfolioReport").visible, "portfolio NAV hidden");
    const history = await WorkbenchApi.get("/api/history");
    check(history.runs.some(run => run.run_id === report.run_id && run.kind === "portfolio"), "portfolio missing from history");
    return { run_id: report.run_id, final_equity: report.metrics.final_equity_cash,
      max_drawdown: report.metrics.max_drawdown, charts: WorkbenchMultiChart.stats() };
  })()`);
  assert.ok(result.final_equity > 0);
  if (process.env.WORKBENCH_SMOKE_PORTFOLIO_EQUITY) assert.ok(
    Math.abs(result.final_equity - Number(process.env.WORKBENCH_SMOKE_PORTFOLIO_EQUITY)) < 1e-6,
    `native portfolio changed: ${result.final_equity}`);
  process.stdout.write(`queued native portfolio UI run passed: ${JSON.stringify(result)}\n`);
}
module.exports = { verifyFloatingWorkspace, verifyPortfolioRun };
