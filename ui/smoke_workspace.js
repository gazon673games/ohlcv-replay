const assert = require("node:assert/strict");
const { waitForAutomaticMarket, waitForInstrumentSelector } = require("./smoke_wait");
const { exerciseEditor } = require("./smoke_editor");
const { verifyMarkerClick } = require("./smoke_linked_trade");
const { verifyEmptyWorkspace } = require("./smoke_empty_workspace");
const { captureModes } = require("./smoke_modes");

async function verifyWorkspace(window) {
  const empty = await verifyEmptyWorkspace(window);
  const result = await window.webContents.executeJavaScript(`(${exerciseWorkspace.toString()})(${exerciseEditor.toString()})`);
  assert.ok(result.tradeNavigation && result.contextPreserved && result.displayReload && result.comparison && result.runLifecycle);
  result.markerLink = await verifyMarkerClick(window);
  result.empty = empty;
  await captureModes(window);
  await window.loadURL(window.webContents.getURL());
  await waitForInstrumentSelector(window);
  await waitForAutomaticMarket(window);
  const restored = await window.webContents.executeJavaScript(`(() => {
    const saved = JSON.parse(localStorage.getItem("workbench.windows.v1"));
    if (!saved.strategy.visible || !saved.tradesView.visible
      || !WorkbenchWindows.get("strategy").visible || !WorkbenchWindows.get("tradesView").visible) {
      throw new Error("workspace panels, active tab and sizes did not survive reload");
    }
    WorkbenchWorkspace.openPanel("data");
    WorkbenchCore.showView("overviewView");
    document.getElementById("closeResultsButton").click();
    return true;
  })()`);
  assert.ok(restored);
  process.stdout.write(`workspace UX scenarios passed: ${JSON.stringify(result)}\n`);
}

async function exerciseWorkspace(editorCheck) {
  const $ = id => document.getElementById(id);
  const check = (value, message) => { if (!value) throw new Error(message); };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const source = WorkbenchEditor.getSource();
  const capital = $("initialCapital").value;
  const candle = index => ({
    ts: new Date(Date.UTC(2026, 0, 5, 10) + index * 60000).toISOString(),
    open: 100 + index, high: 102 + index, low: 99 + index, close: 101 + index,
  });
  const report = {
    run_id: "ux_fixture", metrics: { total_return: 0.02, net_pnl: 2000, trade_count: 2 },
    config: { dataset: { path: "ux_fixture.parquet" }, portfolio: { initial_capital: 100000 },
      strategy: { strategy_params: { period: 20 } }, execution: { timing: "signal_close_to_next_bar_open" } },
    series: { candles: Array.from({ length: 80 }, (_, index) => candle(index)),
      equity: Array.from({ length: 80 }, (_, index) => ({ ...candle(index), equity_cash: 100000 + index * 10 })) },
    tables: {
      decision_actions: [10, 20].map((index, position) => ({
        ts: candle(index).ts, fill_ts: candle(index).ts, fill_price: 100 + index,
        filled_contract_delta: position ? -1 : 1, action: position ? "close_long" : "open_long",
        order_status: "filled", previous_contracts: position ? 1 : 0, target_contracts: position ? 0 : 1,
      })),
      trades: [
        { trade_id: 1, direction: "long", entry_ts: candle(10).ts, exit_ts: candle(20).ts, entry_price: 110, exit_price: 120, net_pnl: 10 },
        { trade_id: 2, direction: "short", entry_ts: candle(35).ts, exit_ts: candle(45).ts, entry_price: 135, exit_price: 145, net_pnl: -10 },
        { trade_id: 3, direction: "long", entry_ts: "2020-01-01T00:00:00", exit_ts: "2020-01-02T00:00:00" },
      ],
    },
  };
  const previewGet = WorkbenchApi.get;
  let previewRequests = 0;
  WorkbenchApi.get = async url => {
    if (!url.includes("/ux_display/preview?")) return previewGet(url);
    previewRequests++;
    return { rows: report.series.candles.map(row => ({ ...row, chart_sma: row.close - 1 })),
      preview_row_count: 80, done: true, timeframe: $("chartTimeframeSelect").value };
  };
  await WorkbenchStreamUI.loadDataset({ dataset_id: "ux_display", dataset_path: "ux_fixture.parquet", timeframe: "1m", row_count: 80 });
  $("initialCapital").value = "123456";
  WorkbenchRunUI.renderReport(report);
  await delay(120);
  check($("initialCapital").value === "123456", "opening report overwrote next-run capital");
  check($("reportParams").textContent.includes("100000"), "report settings are unavailable");
  WorkbenchCore.showView("tradesView");
  const initial = WorkbenchMarketChart.getVisibleRange();
  $("tradesTable").querySelector('tr[data-trade-index="0"] button').click();
  await delay(60);
  const tradeRange = WorkbenchMarketChart.getVisibleRange();
  check(tradeRange.to - tradeRange.from < initial.to - initial.from, "trade did not zoom to its candles");
  check($("tradeSelectionNote").textContent.includes("#1"), "selected trade feedback missing");
  check(WorkbenchMarketChart.stats().markerCount === 2, "trade navigation replaced execution markers");
  $("tradeSearch").value = "#2";
  $("tradeSearch").dispatchEvent(new Event("input"));
  check($("tradesTable").querySelectorAll("tr[data-trade-index]").length === 1, "trade search failed");
  $("tradeSearch").value = "";
  $("tradeSearch").dispatchEvent(new Event("input"));
  $("tradeDirection").value = "short";
  $("tradeDirection").dispatchEvent(new Event("change"));
  check($("tradesTable").querySelectorAll("tr[data-trade-index]").length === 1, "trade direction filter failed");
  $("tradeDirection").value = "";
  $("tradeDirection").dispatchEvent(new Event("change"));
  $("tradesTable").querySelector('tr[data-trade-index="2"] button').click();
  check(!$("tradeSelectionNote").textContent.includes("#3"), "missing candles were silently fabricated");
  check(WorkbenchMarketChart.getVisibleRange().from === tradeRange.from, "unavailable trade moved the chart");

  const timeframe = $("chartTimeframeSelect").value;
  const alternative = [...$("chartTimeframeSelect").options].find(option => option.value !== timeframe);
  check(alternative, "timeframe choices missing");
  $("chartTimeframeSelect").value = alternative.value;
  $("chartTimeframeSelect").dispatchEvent(new Event("change"));
  await delay(120);
  check(WorkbenchCore.state.lastReport === report && $("tradesView").classList.contains("active"), "display timeframe lost selected result");
  check(WorkbenchMarketChart.stats().equityCount === 80 && WorkbenchMarketChart.stats().markerCount === 2, "display reload lost equity or executions");
  const sma = $("showSma").checked;
  $("showSma").checked = true;
  $("showSma").dispatchEvent(new Event("change"));
  await delay(350);
  check(previewRequests >= 3 && WorkbenchCore.state.lastReport === report, "indicator reload lost selected result");
  check(Math.abs(WorkbenchMarketChart.getVisibleRange().from - tradeRange.from) < 2, "display reload reset trade context");
  $("showSma").checked = sma;
  $("showSma").dispatchEvent(new Event("change"));
  $("chartTimeframeSelect").value = timeframe;
  WorkbenchApi.get = previewGet;

  WorkbenchWorkspace.openPanel("strategy");
  WorkbenchWorkspace.openPanel("data");
  WorkbenchCore.showView("overviewView");
  WorkbenchCore.showView("tradesView");
  WorkbenchWorkspace.openPanel("strategy");
  $("closePanelButton").click();
  await delay(70);
  const editor = await editorCheck();
  await delay(70);
  WorkbenchWorkspace.openPanel("strategy");
  await delay(70);
  check(WorkbenchEditor.getSource() === source, "changing panels lost the editor draft");
  check(Math.abs(WorkbenchMarketChart.getVisibleRange().from - tradeRange.from) < 2,
    `changing panels reset chart zoom: ${JSON.stringify({ before: tradeRange, after: WorkbenchMarketChart.getVisibleRange() })}`);
  $("focusChartButton").click();
  check(WorkbenchWindows.get("market").maximized, "chart window did not maximize");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  check(!WorkbenchWindows.get("market").maximized && WorkbenchWindows.get("strategy").visible, "chart maximize failed to restore windows");
  await delay(70);
  const trades = WorkbenchWindows.get("tradesView");
  trades.node.querySelector(".window-resize").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
  check(JSON.parse(localStorage.getItem("workbench.windows.v1")).tradesView.rect.height === trades.rect.height, "window resizing was not saved");
  await delay(70);
  $("marketChart").dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true }));
  await delay(60);
  check(WorkbenchMarketChart.getVisibleRange().to - WorkbenchMarketChart.getVisibleRange().from < tradeRange.to - tradeRange.from, "chart zoom shortcut failed");
  $("marketChart").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 200, clientY: 200 }));
  check(!$("chartContextMenu").hidden, "chart context menu failed");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  check($("chartContextMenu").hidden, "Escape did not close chart menu");

  const originalPost = WorkbenchApi.post;
  const originalGet = WorkbenchApi.get;
  const originalEnsure = WorkbenchDataUI.ensureRunDataset;
  let compared = null;
  WorkbenchApi.post = async (url, payload) => {
    check(url === "/api/compare", "comparison used unexpected API");
    compared = payload.run_ids;
    return { runs: payload.run_ids.map(run_id => ({ run_id, metrics: report.metrics, equity: report.series.equity })) };
  };
  WorkbenchHistoryUI.render(["ux_a", "ux_b"].map(run_id => ({ run_id, status: "completed" })));
  $("historyTable").querySelectorAll("input").forEach(input => {
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  $("compareButton").click();
  await delay(50);
  check(compared?.join(",") === "ux_a,ux_b", "history selection failed to submit comparison IDs");
  check($("jobsView").classList.contains("active") && $("compareTable").textContent.includes("ux_b"), "comparison is hidden");

  let submitted = 0;
  let cancelled = false;
  let prepared = 0;
  WorkbenchDataUI.ensureRunDataset = async () => { prepared++; await delay(60); };
  WorkbenchApi.post = async url => {
    if (url.endsWith("/cancel")) { cancelled = true; return {}; }
    check(url === "/api/runs/async", "run used unexpected API");
    submitted++;
    return { run_id: "ux_active" };
  };
  WorkbenchApi.get = async url => {
    if (url.startsWith("/api/progress/")) {
      await delay(100);
      return { status: cancelled ? "cancelled" : "completed", pct: 1, message: "fixture", stage: "run", job_type: "run" };
    }
    if (url.endsWith("/report")) return report;
    return originalGet(url);
  };
  $("runButton").disabled = false;
  $("runButton").click();
  $("runButton").disabled = false;
  $("runButton").click();
  await delay(80);
  check(prepared === 1 && submitted === 1, "duplicate click submitted overlapping runs");
  $("cancelButton").click();
  await delay(180);
  check(cancelled && WorkbenchCore.state.currentJobId === null && !WorkbenchCore.state.runBusy, "cancel did not release run state");
  check($("jobBadge").classList.contains("cancelled"), "cancelled run was displayed as a failure");
  cancelled = false;
  $("runButton").disabled = false;
  $("runButton").click();
  await delay(100);
  const runDeadline = Date.now() + 5000;
  while (WorkbenchCore.state.runBusy && Date.now() < runDeadline) await delay(50);
  check(submitted === 2 && !WorkbenchCore.state.runBusy && $("overviewView").classList.contains("active"),
    `rerun did not reveal result overview: ${JSON.stringify({ submitted, busy: WorkbenchCore.state.runBusy, status: $("statusBox").textContent })}`);
  WorkbenchApi.post = originalPost;
  WorkbenchApi.get = originalGet;
  WorkbenchDataUI.ensureRunDataset = originalEnsure;
  $("initialCapital").value = capital;
  WorkbenchCore.showView("tradesView");
  WorkbenchWorkspace.openPanel("strategy");
  check(document.documentElement.scrollWidth <= window.innerWidth, "workspace caused horizontal page overflow");
  return { tradeNavigation: true, contextPreserved: true, displayReload: true, comparison: true, runLifecycle: true, editor };
}

module.exports = { verifyWorkspace };
