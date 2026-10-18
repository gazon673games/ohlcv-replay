const { app, BrowserWindow } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { validateAudit } = require("./smoke_validate");
const { verifyWorkspace } = require(process.env.WORKBENCH_SMOKE_UX_MODULE || "./smoke_workspace");
const { createWindow, showWindow } = require("./smoke_viewport");
const { verifyLiveRun } = require("./smoke_live_run");
const { verifyFloatingWorkspace, verifyPortfolioRun } = require("./smoke_windows");
const { measureChartPerformance } = require("./smoke_chart_performance");
const { waitForAutomaticMarket, waitForInstrumentSelector, waitForServer } = require("./smoke_wait");
const projectRoot = path.resolve(__dirname, "..");
const backendRoot = path.join(projectRoot, "backtest_engine");
const port = Number(process.env.WORKBENCH_SMOKE_PORT || "8876");
app.commandLine.appendSwitch("disable-features", "CalculateNativeWinOcclusion");
const outputRoot = process.env.WORKBENCH_SMOKE_OUTPUT_ROOT
  || path.join(projectRoot, "data", "workbench", "smoke-runs");
const screenshotPath = process.env.WORKBENCH_SMOKE_SCREENSHOT
  || path.join(projectRoot, "data", "workbench", "ui-smoke.png");
const smokeProfile = process.env.WORKBENCH_SMOKE_PROFILE
  || path.join(outputRoot, `electron-smoke-profile-${process.pid}`);
app.setPath("userData", smokeProfile);
let server = null;
async function main() {
  if (process.env.WORKBENCH_SMOKE_TRACE_FILE) {
    fs.writeFileSync(process.env.WORKBENCH_SMOKE_TRACE_FILE, "");
  }
  fs.mkdirSync(outputRoot, { recursive: true });
  server = spawn(
    "uv",
    [
      "run", "--project", backendRoot, "backtest", "workbench-serve",
      "--host", "127.0.0.1",
      "--port", String(port),
      "--output-root", outputRoot,
    ],
    {
      cwd: backendRoot,
      env: { ...process.env, WORKBENCH_STATIC_ROOT: process.env.WORKBENCH_SMOKE_STATIC_ROOT || path.join(__dirname, "web") },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  await waitForServer(port);
  trace("server-ready");
  const window = createWindow(BrowserWindow);
  await window.loadURL(`http://127.0.0.1:${port}`);
  trace("window-loaded");
  await showWindow(window);
  await new Promise((resolve) => setTimeout(resolve, 2500));
  await configureWorkbench(window);
  await waitForInstrumentSelector(window);
  await waitForAutomaticMarket(window);
  await verifyFloatingWorkspace(window);
  await verifyPortfolioRun(window);
  if (process.env.WORKBENCH_SMOKE_UX === "1") await verifyWorkspace(window);
  if (process.env.WORKBENCH_SMOKE_LIVE_RUN === "1") await verifyLiveRun(window);
  if (process.env.WORKBENCH_SMOKE_PREFERENCES === "1") {
    await window.webContents.executeJavaScript(`(() => { const toggle = document.getElementById("showSma"); toggle.checked = true; toggle.dispatchEvent(new Event("change")); const period = document.getElementById("chartSmaPeriod"); period.value = "37"; period.dispatchEvent(new Event("input")); const color = document.getElementById("smaColor"); color.value = "#123456"; color.dispatchEvent(new Event("input")); })()`);
    await window.loadURL(`http://127.0.0.1:${port}`);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await window.webContents.executeJavaScript(`document.querySelector(".settings-menu").open = true`);
  }
  if (process.env.WORKBENCH_SMOKE_LOAD_DATA) {
    await loadMarketFixture(window);
    const settleMs = Number(process.env.WORKBENCH_SMOKE_AFTER_LOAD_MS
      || (process.env.WORKBENCH_SMOKE_INDICATOR_DENSITY ? 2500 : process.env.WORKBENCH_SMOKE_OVERLAYS ? 700 : 300));
    await new Promise((resolve) => setTimeout(resolve, settleMs));
    trace("market-loaded");
  }
  if (process.env.WORKBENCH_SMOKE_ZOOM_DETAIL) {
    await window.webContents.executeJavaScript(`(() => {
      const stats = WorkbenchMarketChart.stats();
      window.__smokeCandleCountBeforeZoom = stats.candleCount;
      window.__smokePreviewRequestsBeforeZoom = performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/preview?")).length;
      WorkbenchMarketChart.setVisibleRange({
        from: stats.lastCandleTime - Number(${JSON.stringify(process.env.WORKBENCH_SMOKE_ZOOM_SECONDS || String(7 * 86400))}),
        to: stats.lastCandleTime,
      });
    })()`);
    trace("zoom-set");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    trace("zoom-waited");
    await window.webContents.executeJavaScript(`window.__smokeZoomRequestCounts = [window.__smokePreviewRequestsBeforeZoom, performance.getEntriesByType("resource").filter((entry) => entry.name.includes("/preview?")).length]`);
    if (process.env.WORKBENCH_SMOKE_OVERLAYS === "1"
        && process.env.WORKBENCH_SMOKE_INDICATOR_DENSITY !== "1") {
      await window.webContents.executeJavaScript(`(() => { const stats = WorkbenchMarketChart.stats(); WorkbenchMarketChart.setVisibleRange({ from: stats.lastCandleTime - 1, to: stats.lastCandleTime }); })()`);
      await new Promise((resolve) => setTimeout(resolve, 700));
      await window.webContents.executeJavaScript(`(() => { window.__smokeRangeBeforeIndicatorChange = WorkbenchMarketChart.getVisibleRange(); for (const id of ["chartSmaPeriod", "chartEmaPeriod"]) { const input = document.getElementById(id); input.value = "49"; input.dispatchEvent(new Event("input")); } })()`);
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }
  if (process.env.WORKBENCH_SMOKE_RUN_ID) {
    const runId = JSON.stringify(process.env.WORKBENCH_SMOKE_RUN_ID);
    await window.webContents.executeJavaScript(`(async () => {
      const response = await fetch("/api/runs/" + encodeURIComponent(${runId}) + "/report");
      const report = await response.json();
      if (${JSON.stringify(process.env.WORKBENCH_SMOKE_ACTION_MARKERS === "1")}
          || ${JSON.stringify(process.env.WORKBENCH_SMOKE_ACTION_REPORT === "1")}) {
        document.querySelector(".workspace").style.display = "none";
      }
      if (${JSON.stringify(process.env.WORKBENCH_SMOKE_ACTION_MARKERS === "1")}) {
        WorkbenchMarketChart.reset();
        WorkbenchMarketChart.setCandles(report.series?.candles || [], report.tables?.decision_actions || []);
        WorkbenchMarketChart.setEquity(report.series?.equity || []);
        WorkbenchMarketChart.fitContent();
      } else {
        WorkbenchRunUI.renderReport(report, { animate: false });
      }
      if (${JSON.stringify(process.env.WORKBENCH_SMOKE_ACTION_REPORT === "1")}) {
        document.getElementById("resultsShell").open = true;
        WorkbenchCore.showView("actionsView");
        document.getElementById("actionsView").scrollIntoView();
      }
      if (!${JSON.stringify(process.env.WORKBENCH_SMOKE_SKIP_DIAGNOSTICS === "1")}
          && !${JSON.stringify(process.env.WORKBENCH_SMOKE_ACTION_MARKERS === "1")}) {
        document.getElementById("resultsShell").open = true;
        WorkbenchCore.showView("chartsView");
        document.querySelector(".results-shell").scrollIntoView();
      }
    })()`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (process.env.WORKBENCH_SMOKE_RUN_ZOOM_SECONDS) {
      await window.webContents.executeJavaScript(`(() => { const stats = WorkbenchMarketChart.stats(); WorkbenchMarketChart.setVisibleRange({ from: stats.lastCandleTime - ${Number(process.env.WORKBENCH_SMOKE_RUN_ZOOM_SECONDS)}, to: stats.lastCandleTime }); })()`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (process.env.WORKBENCH_SMOKE_PERFORMANCE) await measureChartPerformance(window, app);
  const audit = await window.webContents.executeJavaScript(`${canvasInkScript()}\n({
    title: document.title,
    locale: document.documentElement.lang,
    theme: document.documentElement.dataset.theme,
    appearance: {
      page: getComputedStyle(document.body).backgroundColor,
      surface: getComputedStyle(document.querySelector(".market-stage")).backgroundColor,
      editor: document.querySelector(".monaco-editor")
        ? getComputedStyle(document.querySelector(".monaco-editor")).backgroundColor : null,
      button: getComputedStyle(document.getElementById("buildDatasetButton")).backgroundColor,
    },
    rememberedPreferences: { sma: document.getElementById("showSma").checked, period: document.getElementById("chartSmaPeriod").value, color: document.getElementById("smaColor").value, cookie: document.cookie.includes("ohlcv_replay_preferences_v1=") },
    menuLayers: [Number(getComputedStyle(document.querySelector(".topbar")).zIndex), Number(getComputedStyle(document.querySelector(".indicator-menu")).zIndex)],
    adapters: document.getElementById("adapterSelect").options.length,
    proxyAdapters: document.querySelectorAll("#proxyAdapterList input[data-adapter-id]").length,
    proxyUrl: document.getElementById("proxyUrl").value,
    instruments: document.getElementById("instrumentSelect").options.length,
    selectedInstrument: document.getElementById("instrumentSelect").value,
    fromDate: document.getElementById("dataFromDate").value,
    tillDate: document.getElementById("dataTillDate").value,
    rollPnlPolicy: document.getElementById("rollPnlPolicy").value,
    dataError: document.getElementById("dataError").textContent,
    editorHeight: document.querySelector(".editor-pane").getBoundingClientRect().height,
    marketHeight: document.querySelector(".market-stage").getBoundingClientRect().height,
    marketChartWidth: document.getElementById("marketChart").getBoundingClientRect().width,
    marketCanvasWidths: [...document.querySelectorAll("#marketChart canvas")]
      .map((canvas) => canvas.getBoundingClientRect().width),
    marketPlotWidth: document.querySelector("#marketChart tr td:nth-child(2)")
      ?.getBoundingClientRect().width || 0,
    marketAlongsideWorkspace: Boolean(WorkbenchWindows.get("market") && WorkbenchWindows.get("data")),
    canvasCount: document.querySelectorAll("canvas").length,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    status: document.getElementById("statusBox").textContent,
    chartProgressLabel: document.getElementById("chartProgressLabel").textContent,
    emaColor: document.getElementById("emaColor").value,
    indicatorPeriods: [document.getElementById("chartSmaPeriod").value, document.getElementById("chartEmaPeriod").value],
    rangeBeforeIndicatorChange: window.__smokeRangeBeforeIndicatorChange || null,
    zoomRequestCounts: window.__smokeZoomRequestCounts || null,
    zoomCandleCounts: window.__smokeCandleCountBeforeZoom ? [window.__smokeCandleCountBeforeZoom, WorkbenchMarketChart.stats().candleCount] : null,
    marketLoadMs: window.__smokeMarketLoadMs || 0,
    previewRequestCount: performance.getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/preview?")).length,
    previewMaxPoints: Math.max(0, ...performance.getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/preview?"))
      .map((entry) => Number(new URL(entry.name).searchParams.get("max_points") || 0))),
    previewRequestMs: Math.round(performance.getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/preview?"))
      .reduce((total, entry) => total + entry.duration, 0)),
    marketInk: containerInk("marketChart"),
    marketLeftInk: containerRegionInk("marketChart", 0, 0.34),
    marketRightInk: containerRegionInk("marketChart", 0.66, 1),
    marketStats: WorkbenchMarketChart.stats(),
    positionInk: canvasInk("positionChart"),
  })`);
  trace("audit-ready");
  trace(`audit:${JSON.stringify(audit)}`);
  validateAudit(audit);
  trace("audit-valid");
  if (!window.isVisible()) {
    window.showInactive();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const image = await window.webContents.capturePage();
  trace("capture-ready");
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
  fs.writeFileSync(screenshotPath, image.toPNG());
  process.stdout.write(`${JSON.stringify({ ...audit, screenshotPath })}\n`);
  window.destroy();
}
function trace(stage) {
  if (process.env.WORKBENCH_SMOKE_TRACE === "1") process.stdout.write(`[smoke] ${stage}\n`);
  if (process.env.WORKBENCH_SMOKE_TRACE_FILE) {
    fs.appendFileSync(process.env.WORKBENCH_SMOKE_TRACE_FILE, `${stage}\n`);
  }
}
async function loadMarketFixture(window) {
  const fromDate = JSON.stringify(process.env.WORKBENCH_SMOKE_FROM_DATE || "2026-07-01");
  const tillDate = JSON.stringify(process.env.WORKBENCH_SMOKE_TILL_DATE || "2026-07-02");
  await window.webContents.executeJavaScript(`(async () => {
    const startedAt = performance.now();
    document.getElementById("dataFromDate").value = ${fromDate};
    document.getElementById("dataTillDate").value = ${tillDate};
    const chartTimeframe = ${JSON.stringify(process.env.WORKBENCH_SMOKE_CHART_TIMEFRAME || "")};
    if (chartTimeframe) document.getElementById("chartTimeframeSelect").value = chartTimeframe;
    if (${JSON.stringify(process.env.WORKBENCH_SMOKE_OVERLAYS === "1")}) {
      const densityOnly = ${JSON.stringify(process.env.WORKBENCH_SMOKE_INDICATOR_DENSITY === "1")};
      document.getElementById("showSma").checked = true;
      document.getElementById("showEma").checked = true;
      document.getElementById("showInflation").checked = !densityOnly;
      document.getElementById("showBollinger").checked = !densityOnly;
      document.getElementById("showVolume").checked = !densityOnly;
      document.getElementById("chartSmaPeriod").value = "48";
      document.getElementById("chartEmaPeriod").value = "48";
      document.getElementById("bollingerPeriod").value = "48";
      document.querySelector(".indicator-menu").open = true;
    }
    await WorkbenchDataUI.buildDataset();
    if (${JSON.stringify(process.env.WORKBENCH_SMOKE_OVERLAYS === "1")}) { const color = document.getElementById("emaColor"); color.value = "#ff00ff"; color.dispatchEvent(new Event("input")); for (const id of ["chartSmaPeriod", "chartEmaPeriod"]) { const input = document.getElementById(id); input.value = "48"; input.dispatchEvent(new Event("input")); } }
    window.__smokeMarketLoadMs = performance.now() - startedAt;
  })()`);
}
async function configureWorkbench(window) {
  const locale = JSON.stringify(process.env.WORKBENCH_SMOKE_LOCALE || "");
  const theme = JSON.stringify(process.env.WORKBENCH_SMOKE_THEME || "");
  await window.webContents.executeJavaScript(`(() => {
    if (${locale}) document.getElementById("localeSelect").value = ${locale};
    if (${theme}) document.getElementById("themeSelect").value = ${theme};
    if (${locale} || ${theme}) document.getElementById("themeSelect").dispatchEvent(new Event("change"));
  })()`);
}
function canvasInkScript() {
  return `function canvasInk(id) {
    const canvas = document.getElementById(id);
    return canvas ? pixelInk(canvas) : 0;
  }
  function containerInk(id) {
    return [...document.getElementById(id).querySelectorAll("canvas")]
      .reduce((total, canvas) => total + pixelInk(canvas), 0);
  }
  function containerRegionInk(id, fromRatio, tillRatio) {
    return [...document.getElementById(id).querySelectorAll("canvas")]
      .reduce((total, canvas) => total + pixelInk(canvas, fromRatio, tillRatio), 0);
  }
  function pixelInk(canvas, fromRatio = 0, tillRatio = 1) {
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    const fromX = Math.floor(canvas.width * fromRatio);
    const tillX = Math.ceil(canvas.width * tillRatio);
    for (let y = 0; y < canvas.height; y += 4) {
      for (let x = fromX; x < tillX; x += 4) {
        const index = (y * canvas.width + x) * 4;
      const visible = pixels[index + 3] > 0;
      const notWhite = pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245;
      if (visible && notWhite) count += 1;
      }
    }
    return count;
  }`;
}
function stopServer() {
  if (!server || server.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    server.kill("SIGTERM");
  }
}

app.whenReady().then(async () => {
  try {
    await main();
    stopServer();
    app.exit(0);
  } catch (error) {
    const details = String(error.stack || error);
    trace(`error:${details.replaceAll("\n", " | ")}`);
    process.stderr.write(`${details}\n`);
    stopServer();
    app.exit(1);
  }
});

app.on("before-quit", stopServer);
