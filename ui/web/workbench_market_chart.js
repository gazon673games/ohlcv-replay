const WorkbenchMarketChart = (() => {
  const PRICE_PANE = 0;
  const dataTools = WorkbenchMarketChartData;
  let chart = null;
  let candleSeries = null;
  let equityPane = null;
  let markerApi = null;
  let markerDisplay = null;
  let lastCandleTime = null;
  let candleCount = 0;
  let candleData = [];
  let decisionRows = [];
  let renderDurationMs = 0;
  let fitTimer = null;
  let visibleRangeListener = null;
  let visualSeries = [];
  let pricePrecision = 2;
  let markerCount = 0;
  let markerLabelCount = 0;
  let markerRenderFrame = null;
  let selectionMarkers = [];
  let crosshairVisible = true;
  let viewRevision = 0;

  function ensureChart() {
    if (chart) return;
    const library = window.LightweightCharts;
    const container = document.getElementById("marketChart");
    if (!library || !container) throw new Error("Lightweight Charts is unavailable");
    chart = library.createChart(container, dataTools.chartOptions(container, library));
    candleSeries = chart.addSeries(
      library.CandlestickSeries,
      dataTools.candleOptions(),
      PRICE_PANE,
    );
    equityPane = WorkbenchEquityPane.create(chart, timedSetData);
    markerApi = library.createSeriesMarkers(candleSeries, [], {
      autoScale: true,
      zOrder: "top",
    });
    markerDisplay = WorkbenchMarketMarkers.create(markerApi);
    chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (!range) return;
      scheduleDecisionMarkers(range);
      if (visibleRangeListener) visibleRangeListener(range);
    });
  }

  function reset() {
    ensureChart();
    viewRevision++;
    if (fitTimer !== null) clearTimeout(fitTimer);
    fitTimer = null;
    timedSetData(candleSeries, []);
    equityPane.set([]);
    clearVisualOverlays();
    markerDisplay.reset();
    markerCount = 0;
    markerLabelCount = 0;
    if (markerRenderFrame !== null) cancelAnimationFrame(markerRenderFrame);
    markerRenderFrame = null;
    lastCandleTime = null;
    candleCount = 0;
    candleData = [];
    decisionRows = [];
    selectionMarkers = [];
    renderDurationMs = 0;
    pricePrecision = 2;
    candleSeries.applyOptions({ priceFormat: dataTools.priceFormat([], pricePrecision) });
  }

  function setCandles(rows, decisions = null) {
    replaceCandles(rows, false);
    if (decisions !== null) setDecisions(decisions);
  }

  function setCandlesPreservingRange(rows) {
    replaceCandles(rows, true);
  }

  function replaceCandles(rows, preserveRange) {
    ensureChart();
    const visibleRange = preserveRange ? chart.timeScale().getVisibleRange() : null;
    candleData = dataTools.normalizeRows(rows, dataTools.toCandle);
    markerDisplay.invalidate();
    applyPricePrecision(candleData);
    timedSetData(candleSeries, candleData);
    lastCandleTime = candleData.at(-1)?.time ?? null;
    candleCount = candleData.length;
    renderDecisionMarkers();
    if (visibleRange) requestAnimationFrame(() => chart.timeScale().setVisibleRange(visibleRange));
  }

  function appendCandles(rows) {
    ensureChart();
    const additions = dataTools.normalizeRows(rows, dataTools.toCandle);
    if (additions.length) markerDisplay.invalidate();
    applyPricePrecision(additions);
    const startedAt = performance.now();
    for (const item of additions) {
      if (lastCandleTime !== null && item.time < lastCandleTime) continue;
      if (item.time === lastCandleTime) candleData[candleData.length - 1] = item;
      else candleData.push(item);
      lastCandleTime = item.time;
      candleSeries.update(item);
    }
    renderDurationMs += performance.now() - startedAt;
    candleCount = candleData.length;
  }

  function setEquity(rows) {
    ensureChart();
    equityPane.set(rows);
  }

  function appendEquity(rows) {
    ensureChart();
    const startedAt = performance.now();
    equityPane.append(rows);
    renderDurationMs += performance.now() - startedAt;
  }

  function setDecisions(rows) {
    ensureChart();
    selectionMarkers = [];
    decisionRows = rows || [];
    markerDisplay.invalidate();
    renderDecisionMarkers();
  }

  function renderDecisionMarkers(range = chart.timeScale().getVisibleRange()) {
    ({ markerCount, markerLabelCount } = markerDisplay.render(decisionRows, candleData, range, selectionMarkers));
  }

  function focusTrade(trade, timing, index) {
    ensureChart();
    const selection = WorkbenchChartNavigation.tradeSelection(candleData, trade, timing);
    if (!selection) return false;
    viewRevision++;
    if (fitTimer !== null) clearTimeout(fitTimer);
    fitTimer = null;
    selectionMarkers = selection.markers.map((marker, side) => ({ ...marker, id: `trade:${index}:${side}` }));
    chart.timeScale().setVisibleRange(selection.range);
    renderDecisionMarkers();
    return true;
  }

  function control(action) {
    ensureChart();
    viewRevision++;
    if (action === "crosshair") {
      crosshairVisible = !crosshairVisible;
      applyPreferences();
    } else WorkbenchChartNavigation.control(chart, candleSeries, action);
  }

  function onCrosshairMove(listener) {
    ensureChart();
    chart.subscribeCrosshairMove(event => listener(event.time, event.seriesData?.get(candleSeries)));
  }

  function onMarkerClick(listener) {
    ensureChart();
    chart.subscribeClick(event => {
      if (typeof event.hoveredObjectId === "string") listener(event.hoveredObjectId, decisionRows);
    });
  }

  function scheduleDecisionMarkers(range) {
    if (markerRenderFrame !== null) cancelAnimationFrame(markerRenderFrame);
    markerRenderFrame = requestAnimationFrame(() => {
      markerRenderFrame = null;
      renderDecisionMarkers(range);
    });
  }

  function setVisualOverlays(rows, settings) {
    ensureChart();
    clearVisualOverlays();
    visualSeries = WorkbenchMarketIndicators.render(chart, rows, settings || {}, timedSetData);
    equityPane.refresh();
  }

  function clearVisualOverlays() {
    for (const series of visualSeries) chart.removeSeries(series);
    visualSeries = [];
    equityPane.refresh();
  }

  function fitContent() {
    ensureChart();
    viewRevision++;
    applyFullRange();
    scheduleFullRange();
  }

  function applyFullRange() {
    chart.timeScale().fitContent();
  }

  function onVisibleRangeChange(listener) {
    ensureChart();
    visibleRangeListener = listener;
  }

  function setVisibleRange(range) {
    ensureChart();
    viewRevision++;
    chart.timeScale().setVisibleRange(range);
  }

  function getVisibleRange() {
    ensureChart();
    const range = chart.timeScale().getVisibleRange();
    return range ? { from: range.from, to: range.to } : null;
  }

  function stats() {
    const visibleRange = chart?.timeScale().getVisibleRange();
    const logicalRange = chart?.timeScale().getVisibleLogicalRange();
    return {
      candleCount,
      decisionCount: decisionRows.length,
      markerCount,
      markerLabelCount,
      ...equityPane?.stats(),
      plotCount: visualSeries.length,
      pricePrecision,
      visualOverlayCount: visualSeries.length,
      chartWidth: document.getElementById("marketChart")?.clientWidth || 0,
      firstCandleTime: candleData.at(0)?.time ?? null,
      lastCandleTime: candleData.at(-1)?.time ?? null,
      logicalFrom: logicalRange?.from ?? null,
      logicalTo: logicalRange?.to ?? null,
      renderDurationMs: Math.round(renderDurationMs),
      visibleFrom: visibleRange?.from ?? null,
      visibleTo: visibleRange?.to ?? null,
    };
  }

  function timedSetData(series, rows) {
    const startedAt = performance.now();
    series.setData(rows);
    renderDurationMs += performance.now() - startedAt;
  }

  function applyPricePrecision(rows) {
    const format = dataTools.priceFormat(rows, pricePrecision);
    if (format.precision === pricePrecision) return;
    pricePrecision = format.precision;
    candleSeries.applyOptions({ priceFormat: format });
  }

  function scheduleFullRange() {
    if (fitTimer !== null) clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      applyFullRange();
      fitTimer = null;
    }, 50);
  }

  function applyPreferences() {
    if (!chart) return;
    const library = window.LightweightCharts;
    chart.applyOptions(dataTools.themeOptions(library));
    chart.applyOptions({ crosshair: { mode: crosshairVisible ? library.CrosshairMode.Normal : library.CrosshairMode.Hidden } });
    candleSeries.applyOptions(dataTools.candleOptions());
    equityPane.applyPreferences();
    markerDisplay.invalidate();
    renderDecisionMarkers();
  }

  return {
    viewportRevision: () => viewRevision,
    appendCandles,
    appendEquity,
    applyPreferences,
    fitContent,
    focusTrade,
    control,
    onCrosshairMove,
    onMarkerClick,
    getVisibleRange,
    onVisibleRangeChange,
    reset,
    setCandles,
    setCandlesPreservingRange,
    setDecisions,
    setEquity,
    setVisualOverlays,
    setVisibleRange,
    stats,
  };
})();
