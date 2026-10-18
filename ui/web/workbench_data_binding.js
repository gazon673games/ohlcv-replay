const WorkbenchDataBinding = (() => {
  const { $, fillSelect, setBadge, state } = WorkbenchCore;

  function bindDataset(dataset) {
    $("datasetPath").value = dataset.dataset_path || "";
    $("qualityApprovalPath").value = dataset.quality_approval_path || "";
    $("instrumentRegistryPath").value = dataset.instrument_registry_path || "";
    $("calendarPath").value = dataset.calendar_path || "";
    $("catalogPath").value = dataset.catalog_path || "";
    $("datasetId").value = dataset.dataset_id || "";
  }

  function clearDatasetBinding() {
    state.dataset = null;
    state.runDataset = null;
    ["datasetPath", "qualityApprovalPath", "instrumentRegistryPath", "calendarPath", "catalogPath", "datasetId"]
      .forEach((id) => { $(id).value = ""; });
    setBadge($("datasetStatus"), WorkbenchI18n.t("notSelected"), "");
    $("runButton").disabled = true;
  }

  function manualDatasetPath() {
    const path = $("datasetPath").value;
    if (state.dataset?.dataset_path !== path) {
      state.dataset = null;
      state.runDataset = null;
      ["catalogPath", "datasetId"].forEach((id) => { $(id).value = ""; });
    }
    $("runButton").disabled = !path || state.runBusy || Boolean(state.currentJobId);
  }

  function setDefaultDates() {
    const range = WorkbenchDataHelpers.defaultDateRange();
    $("dataFromDate").value = range.from;
    $("dataTillDate").value = range.till;
  }

  function fillValues(select, values, preferred) {
    fillSelect(select, values.map((value) => ({ id: value, name: value })), preferred || values[0]);
  }

  return { bindDataset, clearDatasetBinding, fillValues, manualDatasetPath, setDefaultDates };
})();
