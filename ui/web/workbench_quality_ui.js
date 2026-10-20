const WorkbenchQualityUI = (() => {
  const { $, state } = WorkbenchCore;
  const { t } = WorkbenchI18n;
  let readiness;

  function init(options = {}) {
    readiness = options.readiness;
    if (typeof window !== "undefined") {
      window.addEventListener("workbench-strategy-contract-change", update);
    }
    $("requireQualityGate").addEventListener("change", () => {
      if (state.adapter?.capabilities?.supports_rule_archive && $("rulesEnforcement")) {
        $("rulesEnforcement").value = $("requireQualityGate").checked ? "strict" : "audit";
      }
      update();
    });
    $("rulesEnforcement")?.addEventListener("change", () => {
      if (!state.adapter?.capabilities?.supports_rule_archive) return;
      $("requireQualityGate").checked = $("rulesEnforcement").value === "strict";
      update();
    });
  }

  function update() {
    const ready = readiness?.();
    const dataset = ready ? ready.dataset : state.dataset;
    if (!dataset) {
      $("runButton").title = "Ctrl+Enter";
      $("runButton").disabled = !ready?.canPrepare || ready.busy || state.runBusy || Boolean(state.currentJobId);
      $("qualityModeNote").textContent = ready?.canPrepare ? t("runDataPrepare")
        : $("requireQualityGate").checked ? "" : t("researchMode");
      return;
    }
    const status = dataset.quality_status || "unknown";
    const strict = $("requireQualityGate").checked;
    const invalid = ["rejected", "split_required"].includes(status);
    const blocked = invalid || (strict && status !== "approved");
    const note = invalid ? "qualityDataInvalid" : strict ? "qualityRunBlocked" : "qualityDiagnosticMode";
    $("runButton").disabled = blocked || Boolean(ready?.busy) || state.runBusy || Boolean(state.currentJobId);
    $("qualityDetails").open = status !== "approved";
    $("qualityModeNote").textContent = status === "approved"
      ? ""
      : `${WorkbenchUX.t("nextRunData")} (${dataset.timeframe || "—"}): ${t(note, { status })}`;
    if (status !== "approved" && state.dataset?.dataset_id && dataset.dataset_id !== state.dataset.dataset_id) {
      $("qualityModeNote").textContent += ` ${WorkbenchUX.t("chartQualitySeparate")}`;
    }
    $("qualityModeNote").title = dataset.dataset_id || "";
    // Readiness feedback belongs to the next run; preserve the active job's lifecycle status.
    $("runButton").title = blocked ? `${$("qualityModeNote").textContent}\n${dataset.dataset_id || ""}` : "Ctrl+Enter";
  }

  return { init, update };
})();
