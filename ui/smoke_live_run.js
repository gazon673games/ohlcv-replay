async function verifyLiveRun(window) {
  const result = await window.webContents.executeJavaScript(`(async () => {
    const get = id => document.getElementById(id);
    const previousPolicy = get("cachePolicy").value;
    const previousRunId = get("runId").value;
    const offline = [...get("cachePolicy").options].find(item => ["only", "offline"].includes(item.value));
    if (!offline) throw new Error("adapter does not expose offline cache policy");
    get("cachePolicy").value = offline.value;
    const runId = "ux_live_" + Date.now();
    get("runId").value = runId;
    const blockedDataset = () => {
      const dataset = WorkbenchRunData.readiness().dataset;
      return dataset && get("requireQualityGate").checked && !WorkbenchDataHelpers.qualityAllows(dataset, true) ? dataset : null;
    };
    try {
      WorkbenchQualityUI.update();
      if (get("runButton").disabled && blockedDataset() && get("qualityModeNote").textContent) {
        return { completed: false, qualityBlocked: true, strictGate: true,
          dataStatus: blockedDataset().quality_status,
          reason: get("qualityModeNote").textContent, cachePolicy: offline.value };
      }
      if (get("runButton").disabled) throw new Error("live run was disabled without quality feedback");
      get("runButton").click();
      const deadline = Date.now() + 60000;
      while ((WorkbenchCore.state.runBusy || WorkbenchCore.state.currentJobId) && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const report = WorkbenchCore.state.lastReport;
      if (!WorkbenchCore.state.runBusy && report?.run_id !== runId
          && get("runButton").disabled && blockedDataset() && get("qualityModeNote").textContent) {
        return { completed: false, qualityBlocked: true, strictGate: get("requireQualityGate").checked,
          dataStatus: blockedDataset().quality_status,
          reason: get("qualityModeNote").textContent, cachePolicy: offline.value };
      }
      if (WorkbenchCore.state.runBusy || report?.run_id !== runId) {
        get("cancelButton").click();
        throw new Error("live backtest did not complete: " + get("statusBox").textContent);
      }
      if (!get("resultsShell").open || !get("overviewView").classList.contains("active")) throw new Error("live result was not revealed");
      if (!WorkbenchMarketChart.stats().equityCount) throw new Error("live equity was not plotted");
      return { runId, cachePolicy: offline.value, candles: WorkbenchMarketChart.stats().candleCount,
        equity: WorkbenchMarketChart.stats().equityCount, trades: report.metrics.trade_count,
        completed: true, automaticOverview: true };
    } finally { get("cachePolicy").value = previousPolicy; get("runId").value = previousRunId; }
  })()`);
  process.stdout.write(`live backend workflow verified: ${JSON.stringify(result)}\n`);
  return result;
}
module.exports = { verifyLiveRun };
