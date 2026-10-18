const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const elements = {
  adapterSelect: { value: "binance" }, engineSelect: { value: "spot" },
  instrumentSelect: { value: "BTCUSDT" },
  dataFromDate: { value: "1900-01-01", addEventListener() {} },
  dataTillDate: { value: "2099-01-01", addEventListener() {} },
  dateRangeNote: { textContent: "" },
};
const state = { adapter: { capabilities: { supports_history_range: true } } };
const pending = [];
let sourceTimeframe = "60m";
let fail = false;
let immediate = false;
let calls = 0;
function rangeFor(query) {
  return { symbol: query.get("symbol"), engine: query.get("engine"), timeframe: query.get("timeframe"),
    from_date: query.get("engine") === "spot" ? "2017-08-18" : "2019-12-24",
    till_date: "2026-10-08" };
}
const context = vm.createContext({
  URLSearchParams,
  window: { addEventListener() {} },
  WorkbenchCore: { $: id => elements[id], state, setStatus() {} },
  WorkbenchI18n: { t: (key, values = {}) => key + ":" + JSON.stringify(values) },
  WorkbenchApi: { get: async url => {
    calls++;
    if (fail) throw new Error("Binance offline");
    const query = new URLSearchParams(url.split("?")[1]);
    if (immediate) return rangeFor(query);
    return new Promise(resolve => pending.push({ query, resolve }));
  } },
});
for (const file of ["workbench_data_helpers", "workbench_date_range", "workbench_history_range"]) {
  vm.runInContext(fs.readFileSync("web/" + file + ".js", "utf8") +
    "\nglobalThis." + file + " = " + {
      workbench_data_helpers: "WorkbenchDataHelpers",
      workbench_date_range: "WorkbenchDateRange",
      workbench_history_range: "WorkbenchHistoryRange",
    }[file] + ";", context);
}
const subject = context.workbench_history_range;
const dates = context.workbench_date_range;
subject.init({ sourceTimeframe: () => sourceTimeframe, onUpdate: () => dates.refresh() });
dates.init({ datasets: () => [], sourceTimeframe: () => sourceTimeframe,
  remoteRange: subject.current, onChange() {} });

(async () => {
  const stale = subject.refresh();
  assert.equal(subject.ready(), false);
  assert.match(elements.dateRangeNote.textContent, /checkingHistoryRange/);
  elements.engineSelect.value = "perpetual";
  const current = subject.refresh();
  pending[0].resolve(rangeFor(pending[0].query));
  assert.equal(await stale, false);
  assert.match(elements.dateRangeNote.textContent, /checkingHistoryRange/);
  pending[1].resolve(rangeFor(pending[1].query));
  assert.equal(await current, true);
  assert.equal(elements.dataFromDate.min, "2019-12-24");
  assert.equal(elements.dataFromDate.value, "2019-12-24");
  assert.equal(elements.dataTillDate.value, "2026-10-08");
  assert.match(elements.dateRangeNote.textContent, /historyRangeAvailable/);
  await subject.ensure();
  assert.equal(calls, 2);

  elements.engineSelect.value = "spot";
  await subject.refresh();
  assert.equal(elements.dataFromDate.min, "2017-08-18");
  assert.equal(calls, 2);
  immediate = true;
  sourceTimeframe = "5m";
  await subject.ensure();
  assert.equal(calls, 3);
  assert.equal(subject.current().range.timeframe, "5m");

  elements.instrumentSelect.value = "ETHUSDT";
  fail = true;
  await assert.rejects(subject.ensure(), /Binance offline/);
  assert.equal(subject.ready(), false);
  assert.match(elements.dateRangeNote.textContent, /historyRangeFailed/);
  fail = false;
  await subject.ensure();
  assert.equal(subject.ready(), true);
  assert.equal(subject.current().range.symbol, "ETHUSDT");

  state.adapter.capabilities.supports_history_range = false;
  await subject.refresh();
  assert.equal(subject.current(), null);
  assert.equal(subject.ready(), true);
  assert.equal(elements.dataFromDate.min, "");
  assert.match(elements.dateRangeNote.textContent, /dateRangeAvailable/);
  process.stdout.write("remote history range UI tests passed\n");
})().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
