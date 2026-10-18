function validateAudit(audit) {
  if (process.env.WORKBENCH_SMOKE_THEME && audit.theme !== process.env.WORKBENCH_SMOKE_THEME) {
    throw new Error("selected appearance theme was not applied");
  }
  if (audit.theme === "grimdark" && audit.appearance.editor !== audit.appearance.surface) {
    throw new Error("Grimdark editor did not use the interface palette");
  }
  if (audit.horizontalOverflow) throw new Error("workbench has horizontal overflow");
  if (audit.marketHeight < 300) throw new Error("primary market chart is too short");
  if (!audit.instruments || !audit.selectedInstrument) {
    throw new Error("instrument selector is empty");
  }
  if (audit.proxyAdapters !== audit.adapters || !audit.proxyUrl) {
    throw new Error("proxy settings did not load the available adapters and address");
  }
  if (!audit.fromDate || !audit.tillDate) throw new Error("instrument dates were not populated");
  if (audit.rollPnlPolicy !== "exclude_gap") {
    throw new Error("continuous futures must explicitly exclude the non-tradable roll gap");
  }
  if (!audit.marketAlongsideWorkspace) {
    throw new Error("market chart and workspace panel must share the workspace");
  }
  if (process.env.WORKBENCH_SMOKE_RUN_ID
      && (!audit.marketStats.candleCount || !audit.marketStats.equityCount)) {
    throw new Error("run report did not render price and equity charts");
  }
  if (process.env.WORKBENCH_SMOKE_EXPECTED_MARKERS
      && audit.marketStats.markerCount !== Number(process.env.WORKBENCH_SMOKE_EXPECTED_MARKERS)) {
    throw new Error(`expected ${process.env.WORKBENCH_SMOKE_EXPECTED_MARKERS} action markers, got ${audit.marketStats.markerCount}`);
  }
  if (process.env.WORKBENCH_SMOKE_LOAD_DATA
      && (!audit.marketInk || !audit.marketStats.candleCount)) {
    throw new Error("market data did not render on the price chart");
  }
  if (process.env.WORKBENCH_SMOKE_LOAD_DATA && audit.marketRightInk < 10) {
    throw new Error("market chart did not render in its right third");
  }
  if (process.env.WORKBENCH_SMOKE_LOAD_DATA
      && audit.marketPlotWidth < audit.marketChartWidth * 0.8) {
    throw new Error("market plot pane did not fill the chart width");
  }
  if (process.env.WORKBENCH_SMOKE_LOAD_DATA
      && !process.env.WORKBENCH_SMOKE_ZOOM_DETAIL
      && (audit.marketStats.visibleFrom > audit.marketStats.firstCandleTime
        || audit.marketStats.visibleTo < audit.marketStats.lastCandleTime)) {
    throw new Error("market chart did not fit the selected date range");
  }
  if (process.env.WORKBENCH_SMOKE_RUN_ID
      && !process.env.WORKBENCH_SMOKE_RUN_ZOOM_SECONDS
      && (audit.marketStats.visibleFrom > audit.marketStats.firstCandleTime
        || audit.marketStats.visibleTo < audit.marketStats.lastCandleTime)) {
    throw new Error("run report chart did not fit its complete date range");
  }
  if (process.env.WORKBENCH_SMOKE_RUN_ID
      && (!audit.marketStats.decisionCount
        || (process.env.WORKBENCH_SMOKE_OVERLAYS !== "1" && audit.marketStats.plotCount))) {
    throw new Error("strategy report coupling or diagnostics rendering is incorrect");
  }
  if (process.env.WORKBENCH_SMOKE_RUN_ID
      && process.env.WORKBENCH_SMOKE_SKIP_DIAGNOSTICS !== "1"
      && process.env.WORKBENCH_SMOKE_ACTION_MARKERS !== "1"
      && process.env.WORKBENCH_SMOKE_ACTION_REPORT !== "1"
      && !audit.positionInk) {
    throw new Error("strategy diagnostics did not render");
  }
  const expectedOverlays = process.env.WORKBENCH_SMOKE_INDICATOR_DENSITY === "1" ? 2 : 8;
  if (process.env.WORKBENCH_SMOKE_OVERLAYS === "1"
      && audit.marketStats.visualOverlayCount !== expectedOverlays) {
    throw new Error("display-only chart indicators were not rendered");
  }
  if (process.env.WORKBENCH_SMOKE_INDICATOR_DENSITY === "1"
      && (audit.previewMaxPoints < 20000
        || audit.marketStats.candleCount < 20000
        || audit.marketStats.pricePrecision < 3)) {
    throw new Error("moving-average preview was sampled too sparsely");
  }
  if (process.env.WORKBENCH_SMOKE_OVERLAYS === "1" && audit.emaColor !== "#ff00ff") {
    throw new Error("indicator color changes were not applied");
  }
  if (process.env.WORKBENCH_SMOKE_OVERLAYS === "1") {
    const expectedPeriods = process.env.WORKBENCH_SMOKE_ZOOM_DETAIL
      && process.env.WORKBENCH_SMOKE_INDICATOR_DENSITY !== "1" ? "49,49" : "48,48";
    const periodsLoaded = audit.indicatorPeriods.join() === expectedPeriods
      && audit.previewRequestCount >= 2;
    if (!periodsLoaded) throw new Error("indicator period input did not reload the chart");
  }
  const previousRange = audit.rangeBeforeIndicatorChange;
  if (previousRange) {
    const fromShift = Math.abs(audit.marketStats.visibleFrom - previousRange.from);
    const toShift = Math.abs(audit.marketStats.visibleTo - previousRange.to);
    if (fromShift > 2 || toShift > 2) {
      throw new Error("indicator reload reset the visible chart range");
    }
  }
  if (audit.zoomRequestCounts) {
    const requestCountChanged = audit.zoomRequestCounts[0] !== audit.zoomRequestCounts[1];
    const candleCountChanged = audit.zoomCandleCounts && audit.zoomCandleCounts[0] !== audit.zoomCandleCounts[1];
    if (requestCountChanged || candleCountChanged) {
      throw new Error("chart zoom changed the loaded data resolution");
    }
  }
  if (process.env.WORKBENCH_SMOKE_PREFERENCES === "1") {
    const preferences = audit.rememberedPreferences;
    const appearanceRestored = audit.locale === "en" && audit.theme === "dark";
    const indicatorsRestored = preferences.sma && preferences.period === "37"
      && preferences.color === "#123456";
    if (!appearanceRestored || !indicatorsRestored || !preferences.cookie) {
      throw new Error("workbench preferences did not survive a reload");
    }
  }
  if (audit.menuLayers[0] <= audit.menuLayers[1]) throw new Error("settings menu is rendered below chart controls");
}

module.exports = { validateAudit };
