const WorkbenchResearchUI = (() => {
  const { $, parseGrid, setStatus, showView, state } = WorkbenchCore;

  function init() {
    $("sweepButton").addEventListener("click", runSweep);
    $("validateButton").addEventListener("click", validateRun);
  }

  async function runSweep() {
    if (state.runBusy || state.currentJobId) return;
    state.runBusy = true;
    $("runButton").disabled = true;
    try {
      await WorkbenchDataUI.ensureRunDataset();
      const baseRequest = WorkbenchRunUI.baseRunRequest();
      baseRequest.run_id = null;
      const request = {
        base_request: baseRequest,
        param_grid: parseGrid($("sweepGrid").value),
        split_date: $("splitDate").value || null,
        max_runs: Number($("maxSweepRuns").value || 100),
      };
      setStatus("Submitting parameter sweep...", "queued");
      const payload = await WorkbenchApi.post("/api/research/sweeps", request);
      state.currentJobId = payload.run_id;
      $("cancelButton").disabled = false;
      await WorkbenchRunUI.pollJob(payload.run_id);
      const report = await WorkbenchApi.get(`/api/research/${encodeURIComponent(payload.run_id)}`);
      renderResearch(report);
      await WorkbenchRunUI.loadJobs();
      showView("researchView");
    } catch (error) {
      if (error.code === "JOB_CANCELLED") setStatus(WorkbenchUX.t("cancelled"), "cancelled");
      else setStatus(`Research failed: ${error.message}`, "failed");
    } finally {
      state.currentJobId = null;
      state.runBusy = false;
      $("cancelButton").disabled = true;
      WorkbenchQualityUI.update();
      WorkbenchMarketData.resume();
    }
  }

  function renderResearch(report) {
    state.lastResearch = report;
    WorkbenchCharts.renderMetrics($("researchSummary"), {
      run_count: report.run_count,
      acceptance_status: report.acceptance_status,
      warning_count: report.warning_count,
      negative_oos_share: report.guardrails?.[0]?.negative_oos_run_share,
    });
    renderResearchTable(
      $("walkForwardTable"),
      report.walk_forward || [],
      ["run_id", "split_date", "is_total_return", "oos_total_return", "oos_max_drawdown", "oos_to_is_return_ratio"],
    );
    renderResearchTable(
      $("robustnessTable"),
      report.robustness || [],
      ["run_count", "positive_oos_share", "median_oos_total_return", "worst_oos_total_return"],
    );
    renderResearchTable(
      $("guardrailsTable"),
      report.guardrails || [],
      ["multiple_testing_warning", "rank_instability_warning", "oos_degradation_warning", "negative_oos_run_share"],
    );
    renderResearchTable(
      $("costStressTable"),
      report.cost_stress || [],
      ["run_id", "stress_bps", "stressed_total_return", "stressed_max_drawdown"],
    );
    setStatus(
      `Research ${report.acceptance_status}: ${report.run_count} runs`,
      report.acceptance_status === "accepted" ? "completed" : "warning",
    );
  }

  function renderResearchTable(table, rows, preferred) {
    const available = new Set(rows.flatMap((row) => Object.keys(row)));
    const columns = preferred.filter((column) => available.has(column));
    const parameterColumns = rows.length
      ? Object.keys(rows[0]).filter((key) => !columns.includes(key) && !key.includes("path"))
      : [];
    columns.push(...parameterColumns.slice(0, 4));
    WorkbenchCharts.renderTable(table, rows, columns);
  }

  async function validateRun() {
    try {
      const payload = await WorkbenchApi.post("/api/validation", {
        run_id: $("validationRunId").value,
        statement_path: $("statementPath").value,
        tolerance: Number($("validationTolerance").value || 0.01),
      });
      $("validationBox").textContent = [
        `status: ${payload.status}`,
        `breaks: ${payload.break_count}`,
        `backtest pnl: ${payload.total_backtest_pnl}`,
        `statement pnl: ${payload.total_statement_pnl}`,
        ...(payload.breaks || []).slice(0, 5).map((item) => JSON.stringify(item)),
      ].join("\n");
      setStatus(`External validation: ${payload.status}`, payload.status);
    } catch (error) {
      $("validationBox").textContent = error.message;
      setStatus(`External validation failed: ${error.message}`, "failed");
    }
  }

  return { init, renderResearch };
})();
