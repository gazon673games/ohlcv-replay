const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const elements = new Map();
function get(id) {
  if (!elements.has(id)) elements.set(id, {
    value: "", checked: false, listeners: {}, classList: { toggle() {} },
    addEventListener(type, callback) { this.listeners[type] = callback; },
  });
  return elements.get(id);
}
function fillSelect(select, items, preferred) {
  select.value = items.some(item => item.id === preferred) ? preferred : items[0]?.id || "";
}
const state = {};
const coarse = { dataset_id: "eth-4h", continuous_symbol: "ETHUSDT", engine: "perpetual",
  timeframe: "240m", start_ts: "2019-12-24T00:00:00Z", end_ts: "2026-10-08T20:00:00Z",
  quality_status: "warning", dataset_path: "4h.parquet", metadata: {
    adapter_id: "binance", bar_time_semantics: "open_with_available_at",
    requested_from_date: "2019-12-24", requested_till_date: "2026-10-08",
  } };
const fine = { ...coarse, dataset_id: "eth-5m", timeframe: "5m",
  quality_status: "rejected", dataset_path: "5m.parquet" };
const pending = [];
const loaded = [];
const downloads = [];
let probes = 0;
let refreshed = 0;
let strategyTimeframe = "5m";
let failChart = false;
function historyRange(query) {
  return { symbol: query.get("symbol"), engine: query.get("engine"),
    timeframe: query.get("timeframe"), from_date: "2019-12-24", till_date: "2026-10-09",
    last_bar: "2026-10-09T00:00:00Z" };
}
const context = vm.createContext({
  URLSearchParams, setTimeout, clearTimeout, window: { addEventListener() {} },
  WorkbenchCore: { $: get, state, fillSelect, clearError() {}, setBadge() {},
    setStatus() {}, setError() {} },
  WorkbenchI18n: { t: key => key },
  WorkbenchUX: { t: key => key },
  WorkbenchApi: {
    async safeGet(url) {
      return url === "/api/datasets" ? { items: [coarse, fine] }
        : { adapters: [{ id: "binance", capabilities: {
          timeframes: ["5m", "240m", "1d"], supports_history_range: true,
        } }] };
    },
    async get(url) {
      if (url.includes("/history-range?")) {
        probes++;
        const query = new URLSearchParams(url.split("?")[1]);
        return new Promise(resolve => pending.push({ query, resolve }));
      }
      if (url.endsWith("/engines")) return { items: [{ id: "perpetual" }] };
      if (url.includes("/markets")) return { items: [{ id: "crypto" }] };
      if (url.includes("/boards")) return { items: [{ id: "USD_M_PERPETUAL" }] };
      return { items: ["ETHUSDT", "XRPUSDT", "XLMUSDT"].map(symbol => ({ symbol, name: symbol })) };
    },
    async post(_url, request) { downloads.push(request); throw new Error("unexpected download"); },
  },
  WorkbenchDataBinding: { clearDatasetBinding() { state.dataset = null; get("runButton").disabled = true; },
    bindDataset(item) { get("datasetPath").value = item.dataset_path; },
    manualDatasetPath() {}, fillValues() {}, setDefaultDates() {
      get("dataFromDate").value = "2026-07-01"; get("dataTillDate").value = "2026-10-09";
    } },
  WorkbenchAdapterUI: { applyCapabilities() {}, defaultEngine: () => "perpetual",
    renderLatency() {}, setInstrumentMode() {} },
  WorkbenchStreamUI: { prepareInstrument() {}, loadDataset: async item => {
    if (failChart) throw new Error("preview failed"); loaded.push(item);
  } },
  WorkbenchCharts: { renderQuality() {} }, WorkbenchRunUI: {},
  WorkbenchDatasetBuildStream: { stop() {} },
  WorkbenchStrategyUI: { timeframe: () => strategyTimeframe,
    refreshMetadata: async () => { refreshed++; } },
});
for (const name of ["data_helpers", "date_range", "history_range", "data_loading", "quality_ui", "run_data", "market_data", "data_ui"]) {
  vm.runInContext(fs.readFileSync("web/workbench_" + name + ".js", "utf8"), context);
}
vm.runInContext("this.subject=WorkbenchDataUI;", context);

(async () => {
  get("chartTimeframeSelect").value = "240m";
  get("cachePolicy").value = "prefer";
  get("requireQualityGate").checked = true;
  await context.subject.init();
  assert.equal(probes, 1);
  await new Promise(resolve => setTimeout(resolve, 240));
  assert.equal(state.dataset.dataset_id, coarse.dataset_id, "instrument selection must load saved prices automatically");
  assert.equal(loaded.length, 1);
  assert.equal(get("dataFromDate").value, "2019-12-24");
  assert.equal(get("dataTillDate").value, "2026-10-08");
  assert.equal(get("buildDatasetButton").disabled, false, "a slow history probe must not block local data");
  assert.equal((await context.subject.buildDataset()).dataset_id, coarse.dataset_id);
  assert.equal(loaded.length, 2);
  assert.equal(refreshed, 0, "a chart must not compile the strategy");
  assert.equal(downloads.length, 0);
  assert.equal(get("runButton").disabled, true, "strict approval still blocks warning datasets");
  pending[0].resolve(historyRange(pending[0].query));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(get("dataTillDate").value, "2026-10-08", "a background probe must not change the loaded period");

  get("chartTimeframeSelect").value = "5m";
  await get("chartTimeframeSelect").listeners.change();
  assert.equal(probes, 2);
  assert.equal((await context.subject.buildDataset()).dataset_id, fine.dataset_id);
  assert.equal(get("runButton").disabled, true);
  await assert.rejects(context.subject.ensureRunDataset(), /qualityRunBlocked/);
  assert.equal(downloads.length, 0, "a rejected chart must not bypass gates or trigger a repair download");

  get("requireQualityGate").checked = false;
  pending[1].resolve({ ...historyRange(pending[1].query), till_date: "2026-10-08",
    last_bar: fine.end_ts });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  fine.quality_status = "warning";
  assert.equal((await context.subject.ensureRunDataset()).dataset_id, fine.dataset_id);
  assert.equal(downloads.length, 0);

  get("chartTimeframeSelect").value = "1d";
  await get("chartTimeframeSelect").listeners.change();
  assert.equal((await context.subject.buildDataset()).dataset_id, coarse.dataset_id,
    "a finer saved source may build a daily chart regardless of strategy timeframe");
  assert.equal(context.subject.sourceTimeframe(), "5m");
  failChart = true;
  await assert.rejects(context.subject.buildDataset(), /preview failed/);
  assert.equal(get("buildDatasetButton").disabled, false);
  failChart = false;

  get("instrumentSelect").value = "XRPUSDT";
  await get("instrumentSelect").listeners.change();
  const xrp = pending.at(-1);
  xrp.resolve(historyRange(xrp.query));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(get("dataFromDate").value, "2026-07-01", "uncached pairs keep their default period");
  assert.equal(get("dataTillDate").value, "2026-10-09");
  await assert.rejects(context.subject.buildDataset(), /unexpected download/);
  const chartRequest = downloads.pop();
  assert.equal(chartRequest.security, "XRPUSDT");
  assert.equal(chartRequest.timeframe, "1d", "new chart downloads must follow the chart timeframe");
  assert.equal(chartRequest.from_date, "2026-07-01");
  assert.equal(get("buildDatasetButton").disabled, false);

  get("instrumentSelect").value = "XLMUSDT";
  await get("instrumentSelect").listeners.change();
  get("dataFromDate").value = "2025-01-01";
  get("dataFromDate").listeners.change({ target: { id: "dataFromDate" } });
  const xlm = pending.at(-1);
  xlm.resolve(historyRange(xlm.query));
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(get("dataFromDate").value, "2025-01-01", "manual edits must survive background completion");

  get("cachePolicy").value = "only";
  const before = probes;
  get("instrumentSelect").value = "ETHUSDT";
  await get("instrumentSelect").listeners.change();
  get("dataTillDate").value = "2026-10-08";
  assert.equal((await context.subject.buildDataset()).dataset_id, coarse.dataset_id);
  assert.equal((await context.subject.ensureRunDataset()).dataset_id, fine.dataset_id);
  assert.equal(probes, before);
  assert.equal(downloads.length, 0);
  vm.runInContext("WorkbenchMarketData.invalidate();", context);
  process.stdout.write("dataset reuse, fast selection and chart/run isolation tests passed\n");
})().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
