const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const elements = {};
const get = id => elements[id] ||= { value: "", options: [] };
const state = { adapter: { capabilities: { timeframes: ["5m"] } } };
const loaded = [];
const downloads = [];
const cancellations = [];
let delayed;
let rejectDownload = false;
let ready = true;
let error = "";
const dataset = (symbol, adapter, engine, till = "2024-01-04") => ({
  dataset_id: `${adapter}-${symbol}-${till}`, continuous_symbol: symbol,
  dataset_path: `${symbol}.parquet`, engine, timeframe: "5m",
  start_ts: "2024-01-01T00:00:00Z", end_ts: `${till}T23:55:00Z`,
  quality_status: "warning", metadata: { adapter_id: adapter, security: symbol },
});
let datasets = [dataset("CR", "moex", "futures"), dataset("ETHUSDT", "binance", "perpetual")];
function select(symbol, till = "2024-01-04") {
  get("adapterSelect").value = symbol === "CR" ? "moex" : "binance";
  get("engineSelect").value = symbol === "CR" ? "futures" : "perpetual";
  get("instrumentSelect").value = symbol;
  get("dataFromDate").value = "2024-01-01";
  get("dataTillDate").value = till;
  get("chartTimeframeSelect").value = "5m";
  get("cachePolicy").value = "prefer";
  state.dataset = null;
}
const context = vm.createContext({
  URLSearchParams, setTimeout, clearTimeout,
  WorkbenchCore: { $: get, state, clearError() { error = ""; }, setError(value) { error = value; },
    setBadge() {}, setStatus() {}, fillSelect(node, items, preferred) {
      node.options = items.map(item => ({ ...item, value: item.id }));
      node.value = items.some(item => item.id === preferred) ? preferred : items[0]?.id || "";
    } },
  WorkbenchI18n: { t: key => key }, WorkbenchUX: { t: key => key },
  WorkbenchDataBinding: { bindDataset() {} }, WorkbenchDateRange: { freeze() {} },
  WorkbenchQualityUI: { update() {} }, WorkbenchCharts: { renderQuality() {} },
  WorkbenchStreamUI: { async loadDataset(item) { loaded.push(item.metadata.security); } },
  WorkbenchHistoryRange: { async ensure() {} },
  WorkbenchDatasetBuildStream: { stop() {} },
  WorkbenchApi: { async post(url) { cancellations.push(url); } },
  WorkbenchDataLoading: { async download(request) {
    downloads.push(request);
    state.currentJobId = "auto-download";
    try {
      if (delayed) await delayed.promise;
      if (rejectDownload) throw new Error("download failed");
      const result = dataset(request.security, request.adapter_id, request.engine, request.till_date);
      datasets.push(result);
      return { status: "completed", dataset_id: result.dataset_id };
    } finally { state.currentJobId = null; }
  } },
});
for (const name of ["data_helpers", "market_data"]) {
  vm.runInContext(fs.readFileSync(`web/workbench_${name}.js`, "utf8"), context);
}
vm.runInContext("this.subject = WorkbenchMarketData;", context);
const subject = context.subject;
subject.init({ datasets: () => datasets, instrument: () => ({ symbol: get("instrumentSelect").value }),
  canLoad: () => ready, sourceTimeframe: () => "5m", usingNetwork: () => true,
  async reloadDatasets() { subject.renderLibrary(); }, onBusy() {},
});
const settle = () => new Promise(resolve => setTimeout(resolve, 240));
(async () => {
  select("CR");
  subject.changed();
  ready = false;
  await new Promise(resolve => setTimeout(resolve, 30));
  ready = true;
  subject.resume();
  await settle();
  assert.deepEqual(loaded, ["CR"], "CNY prices must appear after selection without selecting a dataset");
  assert.equal(downloads.length, 0);
  assert.equal(get("datasetSelect").options.length, 2, "saved data list must contain only the selected market");

  select("ETHUSDT"); subject.changed(); await settle();
  assert.equal(loaded.at(-1), "ETHUSDT");
  assert.equal(downloads.length, 0, "complete ETH cache must not download candles");

  select("ETHUSDT", "2024-01-08"); subject.changed(); await settle();
  assert.equal(downloads.length, 1, "insufficient cache must download automatically");
  assert.equal(loaded.at(-1), "ETHUSDT");
  assert.equal(state.dataset.end_ts.slice(0, 10), "2024-01-08");
  subject.changed(); await settle();
  assert.equal(downloads.length, 1, "newly stored data must be reused on the next selection");

  select("BTCUSDT"); subject.changed();
  select("CR"); subject.changed(); await settle();
  assert.equal(downloads.length, 1, "rapid selections must not download an abandoned instrument");
  assert.equal(loaded.at(-1), "CR");

  let finish;
  delayed = { promise: new Promise(resolve => { finish = resolve; }) };
  select("ETHUSDT", "2024-01-12"); subject.changed(); await settle();
  assert.equal(subject.busy(), true);
  select("CR"); subject.changed();
  assert.match(cancellations.at(-1), /auto-download\/cancel$/);
  finish(); delayed = null;
  await settle();
  assert.equal(loaded.at(-1), "CR", "a stale ETH completion must not overwrite CNY prices");
  assert.equal(state.dataset.metadata.security, "CR");

  rejectDownload = true;
  select("BTCUSDT"); subject.changed(); await settle();
  assert.match(error, /download failed/);
  assert.equal(subject.busy(), false);
  rejectDownload = false;

  state.runBusy = true;
  select("CR"); subject.changed(); await settle();
  assert.equal(state.dataset, null, "automatic prices must wait for an active run");
  state.runBusy = false; subject.resume(); await settle();
  assert.equal(state.dataset.metadata.security, "CR");
  subject.invalidate();
  process.stdout.write("automatic CNY/ETH cache selection, extension and stale response tests passed\n");
})().catch(error => {
  subject.invalidate(); process.stderr.write(`${error.stack}\n`); process.exitCode = 1;
});
