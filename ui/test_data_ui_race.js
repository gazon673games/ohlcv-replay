const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class ElementStub {
  constructor(value = "") {
    this.value = value;
    this.options = [];
    this.listeners = {};
    this.disabled = false;
    this.classList = { toggle() {} };
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }
}

const ids = [
  "refreshDatasetsButton", "datasetSelect", "adapterSelect", "engineSelect", "marketSelect",
  "boardSelect", "instrumentMode", "loadInstrumentsButton", "instrumentSelect",
  "chartTimeframeSelect", "buildDatasetButton", "datasetPath", "requireQualityGate",
  "dataFromDate", "dataTillDate", "cachePolicy", "rollRule", "cancelButton",
  "instrumentSearch",
];
const elements = Object.fromEntries(ids.map((id) => [id, new ElementStub()]));
elements.chartTimeframeSelect.value = "5m";
elements.dataFromDate.value = "2026-06-01";
elements.dataTillDate.value = "2026-09-01";
let delayedMoex;
let failCatalog = false;
let lastError = "";

function fillSelect(select, items, preferred) {
  select.options = (items || []).map((item) => ({ value: item.id, ...item }));
  select.value = select.options.some((item) => item.value === preferred)
    ? preferred
    : select.options[0]?.value || "";
}

function catalogItem(symbol, engine) {
  return { symbol, name: symbol, engine, market: engine === "futures" ? "forts" : "crypto" };
}

const adapters = [
  { id: "moex", capabilities: { default_engine: "futures", timeframes: ["5m"] } },
  { id: "binance", capabilities: { default_engine: "perpetual", timeframes: ["5m"] } },
];
const api = {
  async safeGet(url) {
    if (url === "/api/datasets") return { items: [] };
    if (url === "/api/adapters") return { adapters };
    if (url.endsWith("/engines")) {
      return { items: url.includes("binance")
        ? [{ id: "spot", name: "Spot" }, { id: "perpetual", name: "Futures" }]
        : [{ id: "futures", name: "Futures" }] };
    }
    if (url.includes("/markets")) return { items: [{ id: url.includes("binance") ? "crypto" : "forts", name: "market" }] };
    if (url.includes("/boards")) return { items: [{ id: url.includes("binance") ? "USD_M_PERPETUAL" : "RFUD", name: "board" }] };
    return { items: [] };
  },
  async get(url) {
    if (failCatalog) throw new Error("adapter offline");
    if (delayedMoex && url.includes("/moex/")) return delayedMoex.promise;
    if (url.endsWith("/engines") || url.includes("/markets") || url.includes("/boards")) {
      return api.safeGet(url);
    }
    return { items: [url.includes("binance")
      ? catalogItem("BTCUSDT", "perpetual")
      : catalogItem("CR", "futures")] };
  },
};
const state = {};
const context = vm.createContext({
  URLSearchParams, setTimeout, clearTimeout,
  window: { addEventListener() {} },
  WorkbenchCore: {
    $: (id) => elements[id], clearError() {}, fillSelect, setBadge() {}, setError(message) { lastError = message; },
    setStatus() {}, state,
  },
  WorkbenchApi: api,
  WorkbenchUX: { t: key => key },
  WorkbenchI18n: { t: (key) => key },
  WorkbenchDataHelpers: {
    marketSelection: (get) => ({ adapterId: get("adapterSelect").value,
      engine: get("engineSelect").value, symbol: get("instrumentSelect").value }),
    adapterBase: (get) => `/api/adapters/${get("adapterSelect").value}`,
    adapterQuery: (get) => new URLSearchParams({ engine: get("engineSelect").value }).toString(),
    bestMatchingDataset: () => null,
    bestChartDataset: () => null, savedHistoryRange: () => null,
    datasetFreshness: () => ({}),
    errorMessage: (prefix, error) => `${prefix}: ${error.message}`,
    instrumentLabel: (item) => item.symbol,
    defaultDateRange: () => ({ from: "2026-06-01", till: "2026-09-01" }),
    requiredSourceTimeframe: () => "5m",
  },
  WorkbenchDataBinding: {
    clearDatasetBinding() {}, fillValues: fillSelect, manualDatasetPath() {},
    setDefaultDates() {},
  },
  WorkbenchAdapterUI: {
    applyCapabilities() {},
    defaultEngine: (capabilities) => capabilities.default_engine || "futures",
    renderLatency() {},
    setInstrumentMode: (engine) => { elements.instrumentMode.value = engine === "futures" ? "nearest_futures" : "security"; },
  },
  WorkbenchQualityUI: { init() {}, update() {} },
  WorkbenchRunData: { init() {}, ensure() {}, readiness() {} },
  WorkbenchDateRange: { init() {}, refresh() {}, resetAutoRange() {}, freeze() {} },
  WorkbenchHistoryRange: { init() {}, reset() {}, ready: () => true,
    refresh: async () => true, ensure: async () => {} },
  WorkbenchStreamUI: { prepareInstrument() {}, stop() {} },
  WorkbenchRunUI: {}, WorkbenchDatasetBuildStream: { stop() {} }, WorkbenchCharts: {},
  WorkbenchStrategyUI: { timeframe: () => "5m" },
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "web", "workbench_market_data.js"), "utf8"), context);
const source = fs.readFileSync(path.join(__dirname, "web", "workbench_data_ui.js"), "utf8");
vm.runInContext(`${source}\nglobalThis.subject = WorkbenchDataUI;`, context);

(async () => {
  await context.subject.init();
  assert.equal(elements.instrumentSelect.value, "CR");

  let resolveMoex;
  delayedMoex = { promise: new Promise((resolve) => { resolveMoex = resolve; }) };
  const staleLoad = elements.boardSelect.listeners.change();
  assert.equal(elements.instrumentSelect.value, "");
  assert.equal(elements.buildDatasetButton.disabled, true);

  elements.adapterSelect.value = "binance";
  const binanceLoad = elements.adapterSelect.listeners.change();
  delayedMoex = null;
  await binanceLoad;
  assert.equal(elements.engineSelect.value, "perpetual");
  assert.equal(elements.instrumentSelect.value, "BTCUSDT");

  resolveMoex({ items: [catalogItem("CR", "futures")] });
  await staleLoad;
  assert.equal(elements.instrumentSelect.value, "BTCUSDT");
  assert.equal(elements.buildDatasetButton.disabled, false);
  failCatalog = true;
  await elements.adapterSelect.listeners.change();
  assert.equal(elements.instrumentSelect.value, "");
  assert.equal(elements.buildDatasetButton.disabled, true);
  assert.match(lastError, /adapter offline/);
  vm.runInContext("WorkbenchMarketData.invalidate();", context);
  process.stdout.write("data UI catalog race tests passed\n");
})().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
