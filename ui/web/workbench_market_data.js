const WorkbenchMarketData = (() => {
  const { $, state, clearError, fillSelect, setBadge, setError, setStatus } = WorkbenchCore;
  const { t } = WorkbenchI18n;
  const helpers = WorkbenchDataHelpers;
  let options;
  let loading = false;
  let revision = 0;
  let pending = false;
  let timer;

  function init(configuration) { options = configuration; }
  function busy() { return loading; }
  function key() {
    return JSON.stringify(["adapterSelect", "engineSelect", "marketSelect", "boardSelect",
      "instrumentSelect", "instrumentMode", "dataFromDate", "dataTillDate",
      "chartTimeframeSelect", "cachePolicy", "rollRule"].map(id => $(id).value));
  }
  function invalidate() {
    revision++;
    pending = false;
    clearTimeout(timer);
    WorkbenchDatasetBuildStream.stop();
    if (loading && state.currentJobId && !state.runBusy) {
      void WorkbenchApi.post(`/api/jobs/${encodeURIComponent(state.currentJobId)}/cancel`).catch(() => {});
    }
  }
  function changed() {
    invalidate();
    renderLibrary();
    pending = true;
    resume();
  }
  function resume() {
    clearTimeout(timer);
    if (!pending || loading || state.currentJobId || state.runBusy || !options.canLoad()) return;
    timer = setTimeout(() => { void build().catch(() => {}); }, 180);
  }
  function renderLibrary(preferred = state.dataset?.dataset_id) {
    const items = options.datasets().filter(item => helpers.matchesDataset(item,
      { ...helpers.marketSelection($), requireCoverage: false }));
    fillSelect($("datasetSelect"), [{ id: "", name: t("automatic") },
      ...items.map(item => ({ id: item.dataset_id, name: helpers.datasetLabel(item) }))], preferred || "");
  }
  function matchingDataset(requireCoverage) {
    if (["refresh", "network"].includes($("cachePolicy").value)) return null;
    const till = $("dataTillDate").value;
    const livePeriod = till >= helpers.datePart(new Date().toISOString());
    const freshness = requireCoverage && livePeriod && options.usingNetwork()
      ? helpers.datasetFreshness($, state.adapter?.capabilities || {},
        WorkbenchHistoryRange.current(options.sourceTimeframe())) : {};
    return helpers.bestChartDataset(options.datasets(), {
      ...helpers.marketSelection($), chartTimeframe: $("chartTimeframeSelect").value || "5m",
      from: $("dataFromDate").value, till, requireCoverage, ...freshness,
    });
  }
  async function selectDataset(dataset = null, isCurrent = () => true) {
    dataset ||= options.datasets().find(item => item.dataset_id === $("datasetSelect").value);
    if (!dataset || !isCurrent()) return;
    WorkbenchDateRange.freeze();
    state.dataset = dataset;
    $("datasetSelect").value = dataset.dataset_id;
    WorkbenchDataBinding.bindDataset(dataset);
    const status = dataset.quality_status || "unknown";
    setBadge($("datasetStatus"), status, status);
    WorkbenchCharts.renderQuality($("qualityBox"), { approval_status: status });
    WorkbenchQualityUI.update();
    await WorkbenchStreamUI.loadDataset({ ...dataset,
      display_name: options.instrument() ? helpers.instrumentLabel(options.instrument()) : null,
    });
  }
  async function selectLibrary() {
    invalidate();
    if (!$("datasetSelect").value) { changed(); return; }
    const selectedKey = key();
    try { await selectDataset(null, () => key() === selectedKey); }
    catch (error) { fail(error); }
  }
  async function build() {
    clearTimeout(timer);
    if (state.runBusy || state.currentJobId) throw new Error(WorkbenchUX.t("runBusy"));
    if (loading) throw new Error(t("loadingMarketData"));
    clearError();
    pending = false;
    loading = true;
    const selectedKey = key();
    const selectedRevision = revision;
    const isCurrent = () => selectedRevision === revision && selectedKey === key();
    options.onBusy();
    try {
      if (!options.canLoad()) throw new Error(t("instrumentCatalogUpdating"));
      helpers.validateSelection({ symbol: $("instrumentSelect").value,
        from: $("dataFromDate").value, till: $("dataTillDate").value });
      WorkbenchDateRange.freeze();
      const cached = matchingDataset(true);
      if (cached) {
        await selectDataset(cached, isCurrent);
        if (isCurrent()) setStatus(t("loadedLocal"), "completed");
        return { status: "completed", dataset_id: cached.dataset_id };
      }
      // Keep available prices visible while the adapter extends the selected period.
      const partial = matchingDataset(false);
      if (partial) await selectDataset(partial, isCurrent);
      if (options.usingNetwork()) await WorkbenchHistoryRange.ensure(options.sourceTimeframe());
      if (!isCurrent()) return null;
      const request = helpers.buildRequest($, options.sourceTimeframe(),
        state.adapter?.capabilities?.default_delay_minutes || 0);
      const progress = await WorkbenchDataLoading.download(request,
        helpers.instrumentLabel(options.instrument()), { preview: !partial, isCurrent });
      await options.reloadDatasets();
      if (!isCurrent()) return progress;
      const dataset = options.datasets().find(item => item.dataset_id === progress.dataset_id);
      if (!dataset) throw new Error(t("runDatasetIncomplete"));
      await selectDataset(dataset, isCurrent);
      if (isCurrent()) setStatus(t("dataReady"), "completed");
      return progress;
    } catch (error) {
      if (isCurrent()) {
        if (error.code === "JOB_CANCELLED") setStatus(WorkbenchUX.t("cancelled"), "cancelled");
        else fail(error);
      }
      throw error;
    } finally {
      loading = false;
      options.onBusy();
      resume();
    }
  }
  function fail(error) {
    const message = helpers.errorMessage(t("loadError"), error);
    setError(message);
    setStatus(message, "failed");
  }
  return { init, busy, build, changed, invalidate, resume, renderLibrary, selectLibrary, selectDataset };
})();
