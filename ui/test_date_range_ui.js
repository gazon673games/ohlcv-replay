const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const elements = {
  dataFromDate: { value: "1900-01-01", addEventListener(_type, listener) { this.listener = listener; } },
  dataTillDate: { value: "2100-01-01", addEventListener(_type, listener) { this.listener = listener; } },
  dateRangeNote: { textContent: "" },
  instrumentSelect: { value: "CR" },
  adapterSelect: { value: "binance" },
  engineSelect: { value: "spot" },
};
const statuses = [];
let changes = 0;
const context = vm.createContext({
  window: { addEventListener() {} },
  WorkbenchCore: {
    $: (id) => elements[id],
    setStatus: (message, status) => statuses.push({ message, status }),
  },
  WorkbenchI18n: { t: (key, values = {}) => `${key}:${values.from || ""}:${values.till || ""}` },
  WorkbenchDataHelpers: {
    marketSelection: (get) => ({ adapterId: get("adapterSelect").value,
      engine: get("engineSelect").value, symbol: get("instrumentSelect").value }),
    dateRangeLimits: (_items, selection) => {
      assert.equal(selection.adapterId, "binance");
      assert.equal(selection.engine, "spot");
      return { min: "2022-05-12", max: "2026-07-22" };
    },
    normalizeDateRange: ({ from, till, min, max }) => ({
      from: from < min ? min : from > max ? max : from,
      till: till < min ? min : till > max ? max : till,
      changed: from < min || from > max || till < min || till > max,
    }),
  },
});
const source = fs.readFileSync(path.join(__dirname, "web", "workbench_date_range.js"), "utf8");
vm.runInContext(`${source}\nglobalThis.subject = WorkbenchDateRange;`, context);

context.subject.init({ datasets: () => [], sourceTimeframe: () => "5m", onChange: () => { changes += 1; } });
elements.dataFromDate.listener({ target: { id: "dataFromDate" } });

assert.equal(elements.dataFromDate.value, "2022-05-12");
assert.equal(elements.dataTillDate.value, "2026-07-22");
assert.equal(elements.dataFromDate.min, "2022-05-12");
assert.equal(elements.dataTillDate.max, "2026-07-22");
assert.match(elements.dateRangeNote.textContent, /dateRangeAvailable/u);
assert.equal(statuses.at(-1).status, "idle");
assert.equal(changes, 1);
process.stdout.write("date range UI tests passed\n");
