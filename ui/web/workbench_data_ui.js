const WorkbenchDataUI = (() => {
  const { $, clearError, fillSelect, setError, setStatus, state } = WorkbenchCore;
  const { t } = WorkbenchI18n;
  const helpers = WorkbenchDataHelpers;
  const binding = WorkbenchDataBinding;
  const adapterUi = WorkbenchAdapterUI;
  const adapterBase = () => helpers.adapterBase($);
  const adapterQuery = () => helpers.adapterQuery($);
  let datasets = new Map();
  let instruments = new Map();
  let catalogRevision = 0;
  let catalogLoading = false;
  const marketData = WorkbenchMarketData;
  async function init() {
    marketData.init({ datasets: () => Array.from(datasets.values()),
      instrument: () => instruments.get($("instrumentSelect").value),
      canLoad: () => !catalogLoading && instruments.has($("instrumentSelect").value),
      sourceTimeframe: chartSourceTimeframe, usingNetwork,
      reloadDatasets: loadDatasets, onBusy: syncBuildButton,
    });
    wireEvents();
    WorkbenchRunData.init({ datasets: () => Array.from(datasets.values()),
      sourceTimeframe, reloadDatasets: loadDatasets,
      canPrepare: () => !catalogLoading && instruments.has($("instrumentSelect").value)
        && Boolean($("dataFromDate").value && $("dataTillDate").value),
      busy: marketData.busy,
      setBusy() { syncBuildButton(); },
    });
    WorkbenchQualityUI.init({ readiness: WorkbenchRunData.readiness });
    WorkbenchHistoryRange.init({ sourceTimeframe: chartSourceTimeframe, onUpdate: () => {
      WorkbenchDateRange.refresh(); syncBuildButton();
    } });
    WorkbenchDateRange.init({ datasets: () => Array.from(datasets.values()),
      localRange, remoteRange: WorkbenchHistoryRange.current,
      sourceTimeframe: chartSourceTimeframe, onChange: selectionEdited });
    await loadDatasets();
    await loadAdapters();
  }
  function wireEvents() {
    $("refreshDatasetsButton").addEventListener("click", () => loadDatasets());
    $("datasetSelect").addEventListener("change", marketData.selectLibrary);
    $("adapterSelect").addEventListener("change", adapterChanged);
    $("engineSelect").addEventListener("change", () => refreshCatalog(loadMarkets));
    $("marketSelect").addEventListener("change", () => refreshCatalog(loadBoards));
    $("boardSelect").addEventListener("change", () => refreshCatalog(loadInstruments));
    $("instrumentMode").addEventListener("change", () => refreshCatalog(loadInstruments));
    $("loadInstrumentsButton").addEventListener("click", () => refreshCatalog(loadInstruments));
    $("instrumentSelect").addEventListener("change", instrumentChanged);
    $("chartTimeframeSelect").addEventListener("change", chartTimeframeChanged);
    $("buildDatasetButton").addEventListener("click", () => marketData.build().catch(() => {}));
    ["cachePolicy", "rollRule"].forEach(id => $(id).addEventListener("change", selectionEdited));
    $("datasetPath").addEventListener("input", binding.manualDatasetPath);
    window.addEventListener("workbench-preferences-change", () => {
      adapterUi.renderLatency(state.adapter?.capabilities || {});
    });
  }
  async function loadAdapters() {
    const payload = await WorkbenchApi.safeGet("/api/adapters", { adapters: [] });
    state.adapters = payload.adapters || [];
    fillSelect($("adapterSelect"), state.adapters, state.adapters[0]?.id);
    await adapterChanged();
  }
  async function adapterChanged() {
    clearError();
    marketData.invalidate();
    binding.clearDatasetBinding();
    state.adapter = state.adapters.find((item) => item.id === $("adapterSelect").value) || null;
    adapterUi.applyCapabilities(state.adapter?.capabilities || {}, binding.fillValues);
    await refreshCatalog(loadEngines);
  }

  async function loadEngines(revision) {
    const payload = await WorkbenchApi.get(`${adapterBase()}/engines`);
    if (!currentCatalog(revision)) return;
    const preferred = adapterUi.defaultEngine(state.adapter?.capabilities || {});
    fillSelect($("engineSelect"), payload.items || [], preferred);
    await loadMarkets(revision);
  }

  async function loadMarkets(revision) {
    binding.clearDatasetBinding();
    const engine = $("engineSelect").value;
    adapterUi.setInstrumentMode();
    const payload = await WorkbenchApi.get(
      `${adapterBase()}/markets?engine=${encodeURIComponent(engine)}`,
    );
    if (!currentCatalog(revision)) return;
    fillSelect($("marketSelect"), payload.items || []);
    await loadBoards(revision);
  }

  async function loadBoards(revision) {
    const query = new URLSearchParams({
      engine: $("engineSelect").value,
      market: $("marketSelect").value,
    });
    const payload = await WorkbenchApi.get(`${adapterBase()}/boards?${query}`);
    if (!currentCatalog(revision)) return;
    fillSelect($("boardSelect"), payload.items || []);
    await loadInstruments(revision);
  }

  async function loadInstruments(revision) {
    clearError();
    try {
      setStatus(t("loadingInstruments"), "running");
      const catalogs = state.adapter?.capabilities?.instrument_catalogs || {};
      const endpoint = catalogs[$("instrumentMode").value] || "instruments";
      const payload = await WorkbenchApi.get(`${adapterBase()}/${endpoint}?${adapterQuery()}`);
      if (!currentCatalog(revision)) return;
      const rawItems = payload.items || [];
      if (!rawItems.length) throw new Error("The adapter returned no instruments");
      instruments = new Map(rawItems.map((item) => [item.symbol, item]));
      const options = rawItems.map((item) => ({ id: item.symbol, name: helpers.instrumentLabel(item) }));
      fillSelect($("instrumentSelect"), options, options[0]?.id);
      await instrumentChanged();
      if (!currentCatalog(revision)) return;
      setStatus(t("instrumentsAvailable", { count: options.length }), "idle");
    } catch (error) {
      if (!currentCatalog(revision)) return;
      instruments = new Map();
      fillSelect($("instrumentSelect"), [{ id: "", name: "Instruments unavailable" }]);
      fail("Could not load instruments", error);
    }
  }

  async function instrumentChanged() {
    clearError();
    binding.clearDatasetBinding();
    const item = instruments.get($("instrumentSelect").value);
    syncBuildButton();
    if (!item) return;
    binding.setDefaultDates();
    WorkbenchDateRange.resetAutoRange();
    WorkbenchStreamUI.prepareInstrument(helpers.instrumentLabel(item));
    WorkbenchDateRange.refresh();
    WorkbenchDateRange.freeze();
    if (usingNetwork()) void WorkbenchHistoryRange.refresh();
    marketData.changed();
    syncBuildButton();
  }

  async function selectionEdited() {
    clearError();
    binding.clearDatasetBinding();
    const item = instruments.get($("instrumentSelect").value);
    WorkbenchStreamUI.prepareInstrument(item ? helpers.instrumentLabel(item) : "");
    WorkbenchDateRange.refresh();
    if (usingNetwork()) void WorkbenchHistoryRange.refresh();
    marketData.changed();
    syncBuildButton();
  }

  async function chartTimeframeChanged() {
    clearError();
    if (WorkbenchStreamUI.canReloadDataset?.()) await WorkbenchStreamUI.reloadDataset();
    else if (state.lastReport) setStatus(WorkbenchUX.t("chartReloadNeeded"), "warning");
    else await selectionEdited();
  }

  async function loadDatasets(preferred) {
    const payload = await WorkbenchApi.safeGet("/api/datasets", { items: [] });
    datasets = new Map((payload.items || []).map((item) => [item.dataset_id, item]));
    marketData.renderLibrary(preferred);
    if (preferred) await marketData.selectDataset();
  }

  function localRange() {
    return helpers.savedHistoryRange(Array.from(datasets.values()), {
      ...helpers.marketSelection($), chartTimeframe: $("chartTimeframeSelect").value || "5m",
    });
  }
  function usingNetwork() { return !["only", "offline"].includes($("cachePolicy").value); }
  function sourceTimeframe() {
    return helpers.requiredSourceTimeframe(state.adapter?.capabilities?.timeframes || ["5m"],
      WorkbenchStrategyUI.timeframe(), null);
  }
  function chartSourceTimeframe() {
    return helpers.requiredSourceTimeframe(state.adapter?.capabilities?.timeframes || ["5m"],
      null, $("chartTimeframeSelect").value || "5m");
  }

  function fail(prefix, error) {
    const message = helpers.errorMessage(prefix, error);
    setError(message);
    setStatus(message, "failed");
  }

  async function refreshCatalog(loader) {
    marketData.invalidate();
    const revision = ++catalogRevision;
    catalogLoading = true;
    instruments = new Map();
    fillSelect($("instrumentSelect"), [{ id: "", name: t("loadingInstruments") }]);
    syncBuildButton();
    try {
      await loader(revision);
    } catch (error) {
      if (currentCatalog(revision)) fail("Could not load adapter catalog", error);
    } finally {
      if (currentCatalog(revision)) {
        catalogLoading = false;
        syncBuildButton();
        marketData.resume();
      }
    }
  }

  function currentCatalog(revision) {
    return revision === catalogRevision;
  }

  function syncBuildButton() {
    $("buildDatasetButton").disabled = catalogLoading || marketData.busy()
      || !instruments.has($("instrumentSelect").value);
    WorkbenchQualityUI.update();
  }

  return { buildDataset: marketData.build, ensureRunDataset: WorkbenchRunData.ensure, init, loadDatasets, sourceTimeframe };
})();
