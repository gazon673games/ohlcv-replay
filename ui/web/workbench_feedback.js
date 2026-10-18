const WorkbenchFeedback = (() => {
  const stages = {
    queued: "jobQueued", worker_start: "phaseWorker", strategy: "phaseStrategy",
    dataset_download: "phaseData", dataset_reuse: "phaseReuse", dataset_quality: "phaseQuality",
    dataset_pipeline: "phaseBuild", dataset_catalog: "phaseBuild", backtest: "phaseRun",
    report: "phaseReport", robustness: "phaseResearch", parameter_sweep: "phaseResearch",
    research_validation: "phaseResearch", cancel_requested: "cancelRequested",
  };
  function badge(status) {
    const key = { idle: "jobIdle", queued: "jobQueued", running: "jobRunning",
      completed: "jobCompleted", failed: "jobFailed", cancelled: "jobCancelled",
      approved: "dataApproved", unknown: "dataUnknown", rejected: "dataRejected",
      split_required: "dataSplit", warning: "jobWarning" }[status];
    return key ? WorkbenchUX.t(key) : status;
  }
  function progress(value) {
    if (["failed", "cancelled"].includes(value.status)) {
      return `${badge(value.status)}${value.status === "failed" && value.message ? `: ${value.message}` : ""}`;
    }
    if (value.status === "completed") return badge(value.status);
    const key = stages[value.stage] || (value.job_type === "run" ? "phaseRun" : "jobRunning");
    const pct = Math.max(0, Math.min(100, Math.round(Number(value.pct || 0) * 100)));
    return `${WorkbenchUX.t(key)} · ${pct}%`;
  }
  return { badge, progress };
})();
