const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const values = { adapterSelect: "binance", engineSelect: "perpetual", instrumentSelect: "ETHUSDT",
  dataFromDate: "2019-12-24", dataTillDate: "2026-10-09", chartTimeframeSelect: "5m",
  cachePolicy: "prefer", requireQualityGate: "", marketSelect: "crypto", boardSelect: "USD_M",
  instrumentMode: "security", rollRule: "" };
const elements = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value }]));
elements.requireQualityGate.checked = false;
const state = { adapter: { capabilities: { timeframes: ["5m", "240m"] } },
  dataset: { dataset_id: "chart-rejected", quality_status: "rejected", dataset_path: "chart.parquet" } };
const old = { dataset_id: "native-old", dataset_path: "native-old.parquet", engine: "perpetual",
  continuous_symbol: "ETHUSDT", timeframe: "240m", quality_status: "warning",
  start_ts: "2019-12-24T00:00:00Z", end_ts: "2026-10-08T20:00:00Z",
  metadata: { adapter_id: "binance", requested_from_date: "2019-12-24",
    requested_till_date: "2026-10-08", bar_time_semantics: "open_with_available_at" } };
const fresh = { ...old, dataset_id: "native-fresh", dataset_path: "native-fresh.parquet",
  end_ts: "2026-10-09T16:00:00Z", metadata: { ...old.metadata, requested_till_date: "2026-10-09",
    source_as_of: new Date().toISOString() } };
let datasets = [old];
let busy = false;
let gateStatus = "warning";
let changeSelection = false;
const downloads = [];
const context = vm.createContext({
  WorkbenchCore: { $: id => elements[id], state, setStatus() {} },
  WorkbenchI18n: { t: key => key },
  WorkbenchStrategyUI: { refreshMetadata: async () => {} },
  WorkbenchHistoryRange: { current: () => null, ensure: async () => {} },
  WorkbenchDateRange: { freeze() {} },
  WorkbenchQualityUI: { update() {} },
  WorkbenchDataBinding: { bindDataset(item) { state.bound = item.dataset_path; } },
  WorkbenchDataLoading: { async download(request, label, options) {
    assert.equal(busy, true);
    downloads.push({ request, label, options });
    if (changeSelection) elements.dataTillDate.value = "2026-10-08";
    return { dataset_id: fresh.dataset_id };
  } },
});
for (const name of ["data_helpers", "run_data"]) {
  vm.runInContext(fs.readFileSync("web/workbench_" + name + ".js", "utf8"), context);
}
vm.runInContext("this.subject = WorkbenchRunData", context);
context.subject.init({ datasets: () => datasets, sourceTimeframe: () => "240m",
  canPrepare: () => true, busy: () => busy, setBusy: value => { busy = value; },
  async reloadDatasets() { datasets = [old, { ...fresh, quality_status: gateStatus }]; },
});

(async () => {
  assert.equal(context.subject.readiness().dataset, null, "Oct8 does not cover Oct9");
  assert.equal((await context.subject.ensure()).dataset_id, fresh.dataset_id);
  assert.equal(elements.dataTillDate.value, "2026-10-09");
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].request.timeframe, "240m", "strategy source is independent of the 5m chart");
  assert.equal(downloads[0].request.preview_timeframe, "240m");
  assert.equal(downloads[0].options.preview, false);
  assert.equal(downloads[0].request.till_date, "2026-10-09");
  assert.equal(state.bound, fresh.dataset_path);
  assert.equal(state.dataset.dataset_id, "chart-rejected");
  assert.equal(busy, false);
  await context.subject.ensure();
  assert.equal(downloads.length, 1, "reuse the newly prepared file");
  elements.requireQualityGate.checked = true;
  await assert.rejects(context.subject.ensure(), /qualityRunBlocked/);
  elements.requireQualityGate.checked = false;
  datasets[1].quality_status = "rejected";
  await assert.rejects(context.subject.ensure(), /qualityRunBlocked/);
  assert.equal(downloads.length, 1, "rejected strategy inputs remain blocked");
  datasets = [old]; gateStatus = "rejected";
  await assert.rejects(context.subject.ensure(), /qualityRunBlocked/);
  assert.equal(busy, false);
  datasets = [old]; gateStatus = "warning"; changeSelection = true;
  await assert.rejects(context.subject.ensure(), /runSelectionChanged/);
  assert.equal(state.bound, fresh.dataset_path, "changed selection must not bind stale inputs");
  assert.equal(busy, false);
  process.stdout.write("native strategy preparation, period, chart isolation and gate tests passed\n");
})().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
