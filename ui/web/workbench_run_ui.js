const WorkbenchRunUI = (() => {
  const {
    $, chartOptions, optionalNumber, requiredNumber, setStatus, showView, state,
  } = WorkbenchCore;
  const { t } = WorkbenchI18n;
  let pendingDiagnostics = null;
  let reportRequestVersion = 0;

  async function init() {
    wireEvents();
    await Promise.all([loadHistory(), loadJobs()]);
  }

  function wireEvents() {
    $("runButton").addEventListener("click", runBacktest);
    $("cancelButton").addEventListener("click", cancelCurrentJob);
    $("loadRunButton").addEventListener("click", loadSelectedRun);
    $("compareButton").addEventListener("click", compareRuns);
    $("refreshJobsButton").addEventListener("click", loadJobs);
    $("resetChartButton").addEventListener("click", WorkbenchMarketChart.fitContent);
    $("resultsShell").addEventListener("toggle", renderPendingDiagnostics);
    window.addEventListener("workbench-view-change", renderPendingDiagnostics);
    window.addEventListener("workbench-layout-change", renderPendingDiagnostics);
    window.addEventListener("workbench-report-cleared", () => {
      reportRequestVersion++;
      pendingDiagnostics = null;
      for (const id of ["drawdownChart", "positionChart", "costChart", "plotChart"]) WorkbenchCharts.drawMultiLine($(id), []);
    });
    window.addEventListener("workbench-preferences-change", redrawVisibleCharts);
  }

  async function runBacktest() {
    if (state.runBusy || state.currentJobId) return;
    state.runBusy = true;
    reportRequestVersion++;
    $("runButton").disabled = true;
    try {
      setStatus(WorkbenchUX.t("preparingRun"), "running");
      await WorkbenchDataUI.ensureRunDataset();
      WorkbenchStreamUI.beginRun();
      setStatus(t("submitBacktest"), "queued");
      const payload = await WorkbenchApi.post("/api/runs/async", baseRunRequest());
      state.currentJobId = payload.run_id;
      $("cancelButton").disabled = false;
      await pollJob(payload.run_id);
      const report = await WorkbenchApi.get(
        `/api/runs/${encodeURIComponent(payload.run_id)}/report`,
      );
      renderReport(report);
      await Promise.all([loadHistory(payload.run_id), loadJobs()]);
      showView("overviewView");
    } catch (error) {
      if (error.code === "JOB_CANCELLED") setStatus(WorkbenchUX.t("cancelled"), "cancelled");
      else setStatus(t("backtestFailed", { error: error.message }), "failed");
    } finally {
      state.currentJobId = null;
      state.runBusy = false;
      $("cancelButton").disabled = true;
      WorkbenchQualityUI.update();
      WorkbenchMarketData.resume();
    }
  }

  function baseRunRequest() {
    const gate = $("requireQualityGate").checked;
    const hasCatalog = Boolean($("catalogPath").value && $("datasetId").value);
    return {
      dataset_path: $("datasetPath").value,
      quality_approval_path: gate ? $("qualityApprovalPath").value || null : null,
      quality_approval_required: gate,
      catalog_path: hasCatalog ? $("catalogPath").value : null,
      dataset_id: hasCatalog ? $("datasetId").value : null,
      catalog_enforcement: hasCatalog ? (gate ? "strict" : "audit") : "off",
      script_source: WorkbenchStrategyUI.sourceForRun(),
      script_language: WorkbenchEditor.getLanguage(),
      params: WorkbenchStrategyUI.collectParams(),
      from_date: $("dataFromDate").value,
      run_id: $("runId").value || null,
      instrument_registry_path: $("instrumentRegistryPath").value || null,
      calendar_path: $("calendarPath").value || null,
      session_filter: $("sessionFilter").value,
      initial_capital: requiredNumber("initialCapital"),
      base_currency: $("baseCurrency")?.value?.trim() || null,
      leverage: Number($("accountLeverage")?.value || 1),
      margin_mode: $("marginMode")?.value || "cross",
      trading_days_per_year: Number($("tradingDaysPerYear")?.value) || null,
      liquidity_role: $("liquidityRole")?.value || "taker",
      max_leverage: optionalNumber("maxLeverage"),
      max_margin_usage: optionalNumber("maxMarginUsage"),
      execution_engine: "v3",
      execution_timing: $("executionTiming").value,
      commission_bps: Number($("commissionBps").value || 0),
      slippage_ticks: Number($("slippageTicks").value || 0),
      bid_ask_spread_ticks: Number($("spreadTicks").value || 0),
      latency_bars: Number($("latencyBars").value || 0),
      volume_participation_limit: optionalNumber("participationLimit"),
      market_impact_bps: Number($("marketImpactBps").value || 0),
      roll_cost_bps: Number($("rollCostBps").value || 0),
      roll_slippage_ticks: Number($("rollSlippageTicks").value || 0),
      roll_pnl_policy: $("rollPnlPolicy").value,
      strict_runtime: true,
    };
  }

  async function pollJob(jobId, onProgress = null, { isCurrent = () => true } = {}) {
    while (true) {
      const progress = await WorkbenchApi.get(`/api/progress/${encodeURIComponent(jobId)}`);
      const percent = Math.round(Number(progress.pct || 0) * 100);
      const message = WorkbenchFeedback.progress(progress);
      if (isCurrent()) WorkbenchStreamUI.setJobProgress(Number(progress.pct || 0), message);
      if (isCurrent() && progress.job_type === "run" && progress.live) {
        WorkbenchStreamUI.renderLiveRun(progress.live);
      }
      if (onProgress) await onProgress(progress);
      if (isCurrent()) {
        setStatus(message, progress.status);
        $("statusBox").title = `${progress.stage}: ${progress.message} (${percent}%)`;
      }
      if (progress.status === "completed") return progress;
      if (progress.status === "failed") throw new Error(progress.message);
      if (progress.status === "cancelled") {
        const error = new Error(WorkbenchUX.t("cancelled"));
        error.code = "JOB_CANCELLED";
        throw error;
      }
      await WorkbenchApi.sleep(350);
    }
  }

  async function cancelCurrentJob() {
    if (!state.currentJobId) return;
    try {
      await WorkbenchApi.post(`/api/jobs/${encodeURIComponent(state.currentJobId)}/cancel`);
      setStatus(WorkbenchUX.t("cancelRequested"), "running");
    } catch (error) {
      setStatus(`Cancellation failed: ${error.message}`, "failed");
    }
  }

  function renderReport(report) {
    if (report.kind === "portfolio") { pendingDiagnostics = null; WorkbenchPortfolioReport.render(report); return; }
    state.lastReport = report;
    pendingDiagnostics = report;
    $("validationRunId").value = report.run_id || "";
    $("reportContext").textContent = `${WorkbenchUX.t("runContext")}: ${report.run_id || "—"} · ${report.config?.instrument?.symbol || report.config?.dataset?.path || ""}`;
    $("reportParams").textContent = JSON.stringify({ strategy: report.config?.strategy,
      portfolio: report.config?.portfolio, execution: report.config?.execution }, null, 2);
    WorkbenchTradeUI.setReport(report);
    WorkbenchCharts.renderMetrics($("metrics"), report.metrics || {});
    const quality = Object.keys(report.dataset_quality || {}).length
      ? report.dataset_quality
      : report.quality_approval || {};
    WorkbenchCharts.renderQuality($("qualityBox"), quality);
    WorkbenchStreamUI.renderReport(report);
    showView("overviewView");
    renderActionTables(report);
    renderPendingDiagnostics();
    setStatus(t("completed", { runId: report.run_id }), "completed");
  }

  function renderPendingDiagnostics() {
    if (!pendingDiagnostics || pendingDiagnostics !== state.lastReport || !diagnosticsVisible()) return;
    const report = pendingDiagnostics;
    const series = report.series || {};
    const options = chartOptions();
    WorkbenchCharts.drawDrawdown($("drawdownChart"), series.equity || [], options);
    renderPositionLegend(series.position || []);
    WorkbenchCharts.drawMultiLine($("positionChart"), [{
      name: t("positionContracts"), rows: series.position || [],
      column: "target_contracts", stepped: true, positionState: true,
      positionColors: { long: "--position-long", flat: "--position-flat", short: "--position-short" },
    }], { ...options, includeZero: true });
    WorkbenchCharts.drawMultiLine($("costChart"), costSeries(series.costs || []), options);
    WorkbenchCharts.drawPlot($("plotChart"), series.plots || {}, options);
    pendingDiagnostics = null;
  }

  function renderPositionLegend(rows) {
    const values = [...new Set(rows.map((row) => Number(row.target_contracts))
      .filter(Number.isFinite))];
    const positive = values.filter((value) => value > 0);
    const negative = values.filter((value) => value < 0);
    const stateValue = (items, fallback) => items.length === 1
      ? WorkbenchCharts.formatValue(items[0])
      : fallback;
    $("positionLongLabel").textContent = `${t("positionLong")}: ${stateValue(positive, "> 0")}`;
    $("positionFlatLabel").textContent = `${t("positionFlat")}: 0`;
    $("positionShortLabel").textContent = `${t("positionShort")}: ${stateValue(negative, "< 0")}`;
  }

  function diagnosticsVisible() {
    if (typeof WorkbenchWindows !== "undefined" && WorkbenchWindows.get("chartsView")) {
      return WorkbenchWindows.get("chartsView").visible;
    }
    return $("resultsShell").open && $("chartsView").classList.contains("active");
  }

  function costSeries(rows) {
    return [
      ["total", "cost_cash", "--cost-total"],
      ["commission", "commission_cost_cash", "--cost-commission"],
      ["slippage", "slippage_cost_cash", "--cost-slippage"],
      ["spread", "spread_cost_cash", "--cost-spread"],
    ].map(([name, column, color]) => ({ name, rows, column, color }));
  }

  async function loadHistory(preferred) {
    const payload = await WorkbenchApi.safeGet("/api/history", { runs: [] });
    const runs = payload.runs || [];
    WorkbenchCore.fillSelect(
      $("historySelect"),
      runs.map((run) => ({ id: run.run_id, name: `${run.name || run.run_id} | ${run.status}` })),
      preferred,
    );
    WorkbenchHistoryUI.render(runs);
  }

  async function loadSelectedRun() {
    if (state.currentJobId || state.runBusy) { setStatus(WorkbenchUX.t("runBusy"), "running"); return; }
    const runId = $("historySelect").value;
    if (!runId) return;
    const version = ++reportRequestVersion;
    try {
      const report = await WorkbenchApi.get(`/api/runs/${encodeURIComponent(runId)}/report`);
      if (version !== reportRequestVersion || state.runBusy || state.currentJobId) return;
      renderReport(report);
      if (report.kind !== "portfolio") showView("overviewView");
    } catch (error) {
      if (version !== reportRequestVersion) return;
      setStatus(`Run report failed: ${error.message}`, "failed");
    }
  }

  async function loadJobs() {
    const payload = await WorkbenchApi.safeGet("/api/jobs", { items: [] });
    WorkbenchCharts.renderTable($("jobsTable"), payload.items || [], [
      "updated_at", "run_id", "job_type", "status", "stage", "message",
    ]);
  }

  async function compareRuns() {
    try {
      const runIds = [...new Set($("compareRunIds").value.split(",").map((item) => item.trim()).filter(Boolean))];
      if (runIds.length < 2) throw new Error(WorkbenchUX.t("compareNeedsTwo"));
      const payload = await WorkbenchApi.post("/api/compare", { run_ids: runIds });
      state.lastComparison = payload;
      renderComparison(payload);
    } catch (error) {
      setStatus(`Comparison failed: ${error.message}`, "failed");
    }
  }

  function renderComparison(payload) {
    const rows = (payload.runs || []).map((run) => ({ run_id: run.run_id, ...run.metrics }));
    WorkbenchCharts.renderTable($("compareTable"), rows, [
      "run_id", "total_return", "max_drawdown", "trade_count", "sharpe",
    ]);
    const series = (payload.runs || []).map((run) => ({
      name: run.run_id, rows: run.equity || [], column: "equity_cash",
    }));
    showView("jobsView");
    WorkbenchCharts.drawMultiLine($("compareChart"), series, chartOptions());
  }

  function redrawVisibleCharts() {
    WorkbenchChartOverlays.applyTheme();
    WorkbenchMarketChart.applyPreferences();
    WorkbenchEditor.applyTheme();
    WorkbenchCharts.redrawVisible();
    if (state.lastReport && state.lastReport.kind !== "portfolio" && diagnosticsVisible()) {
      pendingDiagnostics = state.lastReport;
      renderPendingDiagnostics();
    }
    if (state.lastReport && state.lastReport.kind !== "portfolio") renderActionTables(state.lastReport);
  }

  function renderActionTables(report) {
    WorkbenchCharts.renderTable(
      $("decisionsTable"),
      WorkbenchDecisionReport.decisionRows(report.tables?.decision_actions || []),
      WorkbenchDecisionReport.decisionColumns(),
    );
  }

  return { baseRunRequest, init, loadHistory, loadJobs, pollJob, renderReport };
})();
