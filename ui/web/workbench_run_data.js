const WorkbenchRunData = (() => {
  const { $, state, setStatus } = WorkbenchCore;
  const { t } = WorkbenchI18n;
  const helpers = WorkbenchDataHelpers;
  let options;

  function init(config) { options = config; }

  function selection() {
    return { ...helpers.marketSelection($), sourceTimeframe: options.sourceTimeframe(),
      from: $("dataFromDate").value, till: $("dataTillDate").value,
      requireCoverage: true, requireFinalBars: true,
      ...helpers.datasetFreshness($, state.adapter?.capabilities || {},
        WorkbenchHistoryRange.current(options.sourceTimeframe())),
    };
  }

  function candidate() {
    if (!options?.canPrepare()) return null;
    if (["refresh", "network"].includes($("cachePolicy").value)) return null;
    const target = selection();
    // A wider saved file must be clipped through the adapter before execution.
    const items = options.datasets().filter(item =>
      (item.metadata?.requested_till_date || helpers.datePart(item.end_ts)) === target.till);
    const compatible = helpers.bestMatchingDataset(items, { ...target,
      requireApproval: $("requireQualityGate").checked,
    });
    if (compatible) return compatible;
    const invalid = helpers.bestChartDataset(items, { ...target, latestBar: null,
      minSourceAsOf: null, maxAgeMinutes: null });
    return invalid && !helpers.qualityAllows(invalid, $("requireQualityGate").checked)
      ? invalid : null;
  }

  function readiness() {
    return { dataset: candidate(), canPrepare: Boolean(options?.canPrepare()),
      busy: Boolean(options?.busy()) };
  }

  async function ensure() {
    await WorkbenchStrategyUI.refreshMetadata();
    helpers.validateSelection({ symbol: $("instrumentSelect").value,
      from: $("dataFromDate").value, till: $("dataTillDate").value });
    WorkbenchDateRange.freeze();
    const snapshot = () => {
      const target = selection();
      return JSON.stringify([target.adapterId, target.engine, target.symbol,
        target.sourceTimeframe, target.from, target.till]);
    };
    const chosen = snapshot();
    const assertSelection = () => {
      if (snapshot() !== chosen) throw new Error(t("runSelectionChanged"));
    };
    let dataset = candidate();
    if (dataset && !helpers.qualityAllows(dataset, $("requireQualityGate").checked)) {
      throw new Error(t("qualityRunBlocked", { status: dataset.quality_status || "unknown" }));
    }
    if (!["only", "offline"].includes($("cachePolicy").value)) {
      await WorkbenchHistoryRange.ensure(options.sourceTimeframe());
      assertSelection();
      dataset = candidate();
      if (dataset && !helpers.qualityAllows(dataset, $("requireQualityGate").checked)) {
        throw new Error(t("qualityRunBlocked", { status: dataset.quality_status || "unknown" }));
      }
    }
    if (!dataset) {
      if (!options.canPrepare()) throw new Error(t("instrumentCatalogUpdating"));
      options.setBusy(true);
      try {
        const request = helpers.buildRequest($, options.sourceTimeframe(),
          state.adapter?.capabilities?.default_delay_minutes || 0);
        request.preview_timeframe = request.timeframe;
        const progress = await WorkbenchDataLoading.download(request,
          $("instrumentSelect").value, { preview: false });
        await options.reloadDatasets();
        assertSelection();
        dataset = options.datasets().find(item => item.dataset_id === progress.dataset_id);
        if (!dataset || !helpers.matchesDataset(dataset, selection())) {
          throw new Error(t("runDatasetIncomplete"));
        }
      } finally {
        options.setBusy(false);
      }
    }
    assertSelection();
    if (!helpers.qualityAllows(dataset, $("requireQualityGate").checked)) {
      throw new Error(t("qualityRunBlocked", { status: dataset.quality_status || "unknown" }));
    }
    state.runDataset = dataset;
    WorkbenchDataBinding.bindDataset(dataset);
    WorkbenchQualityUI.update();
    setStatus(t("dataReady"), "completed");
    return dataset;
  }

  return { init, readiness, ensure };
})();
