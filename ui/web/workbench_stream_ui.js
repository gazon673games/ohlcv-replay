const WorkbenchStreamUI = (() => {
  const { $, setError, setStatus, state } = WorkbenchCore;
  const { t } = WorkbenchI18n;
  const PREVIEW_CHUNK_SIZE = 2000;
  const PREVIEW_MAX_POINTS = 32000;
  const PREVIEW_POINTS_PER_PIXEL = 1.5;
  let marketRows = [];
  let previewToken = 0;
  let activeDataset = null;

  async function loadDataset(dataset, options = {}) {
    const preservedRange = options.preserveRange ? WorkbenchMarketChart.getVisibleRange() : null;
    const preservedReport = options.preserveReport && state.lastReport?.kind !== "portfolio" ? state.lastReport : null;
    const token = ++previewToken;
    activeDataset = dataset;
    marketRows = [];
    if (!preservedReport) { state.lastReport = null; clearReportContext(); }
    setMarketHeading(dataset);
    showEmpty(t("preparingChart"));
    setProgress(0, t("readingData"));
    clearMainCharts();
    try {
      const query = previewQuery(0);
      let offset = 0;
      while (token === previewToken) {
        query.set("offset", String(offset));
        const id = encodeURIComponent(dataset.dataset_id);
        const payload = await WorkbenchApi.get(`/api/datasets/${id}/preview?${query}`);
        if (token !== previewToken) return;
        const total = Math.max(1, Number(payload.preview_row_count || marketRows.length));
        await appendRows(payload.rows || [], total, token);
        if (payload.done) {
          WorkbenchChartOverlays.render(marketRows);
          if (preservedReport && state.lastReport === preservedReport) {
            WorkbenchMarketChart.setDecisions(preservedReport.tables?.decision_actions || []);
            WorkbenchMarketChart.setEquity(preservedReport.series?.equity || []);
            WorkbenchCharts.renderMetrics($("metrics"), preservedReport.metrics || {});
            if (typeof CustomEvent !== "undefined") window.dispatchEvent(new CustomEvent("workbench-display-reloaded"));
          }
          if (preservedRange) WorkbenchMarketChart.setVisibleRange(preservedRange);
          else WorkbenchMarketChart.fitContent();
          setProgress(1, completionLabel(dataset, payload));
          return;
        }
        offset = Number(payload.next_offset || marketRows.length);
      }
    } catch (error) {
      if (token !== previewToken) return;
      const message = `${t("loadError")}: ${error.message}`;
      showEmpty(t("chartUnavailable"));
      setProgress(0, t("loadError"));
      setError(message);
      setStatus(message, "failed");
      throw error;
    }
  }

  function previewQuery(offset) {
    const query = new URLSearchParams({
      offset: String(offset),
      limit: String(PREVIEW_CHUNK_SIZE),
      max_points: String(previewPointLimit()),
      timeframe: chartTimeframe(),
    });
    const from = $("dataFromDate").value;
    const till = $("dataTillDate").value;
    if (from) query.set("from_ts", `${from}T00:00:00`);
    if (till) query.set("till_ts", `${till}T23:59:59`);
    return WorkbenchChartOverlays.appendQuery(query);
  }

  async function reloadDataset() {
    // Indicator controls have no awaiting caller; loadDataset already displays the error.
    if (!canReloadDataset()) return false;
    await loadDataset(activeDataset, { preserveRange: true, preserveReport: true }).catch(() => {});
    return true;
  }

  function canReloadDataset() {
    if (!activeDataset) return false;
    const minutes = WorkbenchDataHelpers.timeframeMinutes;
    return minutes(chartTimeframe()) % minutes(activeDataset.timeframe || chartTimeframe()) === 0;
  }

  function prepareInstrument(symbol) {
    previewToken += 1;
    activeDataset = null;
    marketRows = [];
    state.lastReport = null;
    clearReportContext();
    $("marketTitle").textContent = symbol || t("chooseInstrument");
    $("marketSubtitle").textContent = t("chooseInstrumentHint");
    setProgress(0, t("notLoaded"));
    showEmpty(t("clickLoad"));
    clearMainCharts();
  }

  function beginDatasetBuild(label) {
    previewToken += 1;
    activeDataset = null;
    marketRows = [];
    state.lastReport = null;
    clearReportContext();
    $("marketTitle").textContent = label || t("chooseInstrument");
    $("marketSubtitle").textContent = t("loadingMarketData");
    setProgress(0, t("loadingMarketData"));
    showEmpty(t("preparingChart"));
    clearMainCharts();
  }

  async function appendDatasetBuildPreview(rows) {
    if (!rows.length) return;
    marketRows.push(...rows);
    WorkbenchMarketChart.appendCandles(rows);
    $("marketSubtitle").textContent = t("provisionalBars", { count: marketRows.length });
    hideEmpty();
    await nextPaint();
  }

  function beginRun() {
    state.lastReport = null;
    clearReportContext();
    WorkbenchMarketChart.setEquity([]);
    WorkbenchMarketChart.setDecisions([]);
    $("metrics").innerHTML = "";
  }

  function renderLiveRun(live) {
    if (!live) return;
    WorkbenchMarketChart.setEquity(live.equity || []);
    WorkbenchMarketChart.setDecisions(live.decisions || []);
    hideEmpty();
  }

  function renderReport(report) {
    const decisions = report.tables?.decision_actions || [];
    if (marketRows.length && reportUsesActiveDataset(report)) {
      WorkbenchMarketChart.setDecisions(decisions);
    } else {
      activeDataset = null;
      marketRows = [...(report.series?.candles || [])];
      $("marketTitle").textContent = report.config?.instrument?.symbol || report.run_id || t("chooseInstrument");
      $("marketSubtitle").textContent = report.config?.dataset?.path || "";
      WorkbenchMarketChart.setCandles(marketRows, decisions);
      WorkbenchChartOverlays.render(marketRows);
      WorkbenchMarketChart.fitContent();
    }
    WorkbenchMarketChart.setEquity(report.series?.equity || []);
    hideEmpty();
  }

  function reportUsesActiveDataset(report) {
    const reportPath = String(report.config?.dataset?.path || "").toLowerCase();
    const activePath = String(activeDataset?.dataset_path || "").toLowerCase();
    if (activePath && (!reportPath || activePath === reportPath)) return true;
    const run = state.runDataset;
    if (!run || String(run.dataset_path || "").toLowerCase() !== reportPath) return false;
    return ["adapter_id", "security"].every(key => run.metadata?.[key]
        && run.metadata[key] === activeDataset?.metadata?.[key])
      && Boolean(run.engine) && run.engine === activeDataset?.engine;
  }

  function setJobProgress(progress, label) {
    setProgress(Math.max(0, Math.min(1, Number(progress || 0))), label);
  }

  async function appendRows(rows, total, token) {
    if (token !== previewToken) return;
    marketRows.push(...rows);
    // Historical batches use setData; thousands of live update() calls rebuild the time scale.
    if (marketRows.length === rows.length || marketRows.length >= total) {
      WorkbenchMarketChart.setCandles(marketRows);
    }
    const progress = Math.min(1, marketRows.length / total);
    setProgress(progress, t("loadedBars", { loaded: marketRows.length, total }));
    hideEmpty();
    await nextPaint();
  }

  function clearMainCharts() {
    WorkbenchMarketChart.reset();
    WorkbenchChartOverlays.reset();
    $("metrics").innerHTML = "";
  }

  function clearReportContext() {
    if (typeof CustomEvent !== "undefined") window.dispatchEvent(new CustomEvent("workbench-report-cleared"));
  }

  function setMarketHeading(dataset) {
    const displayTimeframe = chartTimeframe();
    const symbol = dataset.display_name
      || dataset.continuous_symbol
      || dataset.metadata?.security
      || dataset.dataset_id;
    $("marketTitle").textContent = symbol;
    const period = [$("dataFromDate").value, $("dataTillDate").value]
      .filter(Boolean)
      .join(" - ");
    const source = dataset.timeframe && dataset.timeframe !== displayTimeframe
      ? `source ${dataset.timeframe}`
      : null;
    $("marketSubtitle").textContent = [displayTimeframe, source, period]
      .filter(Boolean)
      .join(" | ");
  }

  function completionLabel(dataset, payload) {
    const requested = $("dataTillDate").value;
    const available = String(dataset.end_ts || "").slice(0, 10);
    if (requested && available && available < requested) {
      return `${payload.timeframe}: ${available} < ${requested}`;
    }
    const count = payload.range_source_row_count || payload.preview_row_count || marketRows.length;
    return payload.sampling_stride > 1
      ? t("fixedOverview", {
        timeframe: payload.timeframe,
        count,
        stride: payload.sampling_stride,
      })
      : `${payload.timeframe}: ${count} exact bars`;
  }

  function chartTimeframe() {
    return $("chartTimeframeSelect").value || activeDataset?.timeframe || "5m";
  }

  function setProgress(value, label) {
    $("workspaceProgress").value = value;
    $("chartProgressLabel").textContent = label;
  }

  function showEmpty(message) {
    ($("chartEmptyMessage") || $("chartEmptyState")).textContent = message;
    $("chartEmptyState").classList.remove("hidden");
  }

  function hideEmpty() {
    $("chartEmptyState").classList.add("hidden");
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function previewPointLimit() {
    const width = $("marketChart").clientWidth || 800;
    const baseLimit = Math.max(500, Math.floor(width * PREVIEW_POINTS_PER_PIXEL));
    const rowCount = Number(activeDataset?.row_count || 0);
    return Math.min(PREVIEW_MAX_POINTS, Math.max(baseLimit, rowCount));
  }

  return {
    appendDatasetBuildPreview,
    beginDatasetBuild,
    beginRun,
    canReloadDataset,
    loadDataset,
    prepareInstrument,
    reloadDataset,
    renderLiveRun,
    renderReport,
    setJobProgress,
  };
})();
