const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const classes = new Set();
const context = vm.createContext({
  document: { documentElement: { lang: "ru" }, getElementById: () => ({ clientHeight: 600,
    classList: { toggle() {} }, parentElement: { classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); } } } }) },
  getComputedStyle: () => ({ getPropertyValue: () => "#123456" }),
  window: { LightweightCharts: { LineSeries: "line" } },
});
for (const file of ["workbench_time", "workbench_market_chart_data", "workbench_equity_pane",
  "workbench_trade_link", "workbench_ux", "workbench_feedback"]) {
  vm.runInContext(fs.readFileSync(`web/${file}.js`, "utf8"), context);
}
const links = vm.runInContext("WorkbenchTradeLink", context);
const tools = vm.runInContext("WorkbenchMarketChartData", context);
const row = { fill_ts: "2026-01-05T10:10:00Z", fill_price: 100, filled_contract_delta: 1, order_id: "a" };
const trades = [{ entry_ts: row.fill_ts, exit_ts: "2026-01-05T11:00:00Z", entry_price: 100, direction: "long" }];
const marker = tools.markerId(row, 0);
assert.deepEqual(Array.from(links.forMarker(marker, [row], trades)), [0]);
assert.deepEqual(Array.from(links.forMarker(marker, [row], [...trades, { ...trades[0] }])), [0, 1], "ambiguous fills must remain ambiguous");
assert.deepEqual(Array.from(links.forMarker(marker, [row], [{ ...trades[0], entry_price: 101 }])), []);
assert.deepEqual(Array.from(links.forMarker(marker, [row], [{ ...trades[0], direction: "short" }])), []);
assert.deepEqual(Array.from(links.forMarker("trade:0:1", [], trades)), [0]);
assert.deepEqual(Array.from(links.forMarker("trade:20:0", [], trades)), []);
assert.deepEqual(Array.from(links.forMarker("missing", [row], trades)), []);
assert.deepEqual(Array.from(links.forMarker(marker, [row], [{ ...trades[0], entry_price: null }])), []);
const reversal = [{ ...trades[0], direction: "short", exit_ts: row.fill_ts, exit_price: 100 }, trades[0]];
assert.deepEqual(Array.from(links.forMarker(marker, [row], reversal)), [0, 1], "reversal can close one trade and open another");
const rejected = { ...row, filled_contract_delta: 0, action: "open_long" };
assert.deepEqual(Array.from(links.forMarker(tools.markerId(rejected, 0), [rejected], trades)), [], "rejected orders are not executions");

let added = 0;
let removed = 0;
let paneHeight = 0;
let current = null;
const chart = {
  panes: () => current ? [{}, { setHeight(value) { paneHeight = value; } }] : [{}],
  addSeries() { added++; current = { rows: [], applyOptions() {}, setData(rows) { this.rows = rows; }, update(row) { this.rows.push(row); } }; return current; },
  removeSeries(series) { assert.equal(series, current); removed++; current = null; },
};
const equity = vm.runInContext("WorkbenchEquityPane", context).create(chart, (series, rows) => series.setData(rows));
equity.set([]);
equity.append([]);
assert.equal(added, 0, "a blank equity pane must not consume chart space");
equity.set([{ ts: row.fill_ts, equity_cash: 1000 }]);
assert.equal(added, 1);
assert.equal(classes.has("has-equity"), true);
assert.equal(paneHeight, 162);
paneHeight = 240;
equity.set([{ ts: row.fill_ts, equity_cash: 1100 }]);
assert.equal(paneHeight, 240, "report refresh preserves user equity-pane height");
equity.append([{ ts: "2020-01-01T00:00:00Z", equity_cash: 1 }]);
assert.equal(equity.stats().equityCount, 1);
equity.set([]);
assert.equal(removed, 1);
assert.equal(classes.has("has-equity"), false);
equity.set([{ ts: row.fill_ts, equity_cash: 1200 }]);
assert.equal(added, 2, "a later run restores the equity pane");
const feedback = vm.runInContext("WorkbenchFeedback", context);
assert.equal(feedback.progress({ stage: "dataset_download", status: "running", pct: 0.6 }), "Загружаем историю · 60%");
assert.equal(feedback.progress({ stage: "report", status: "running", pct: 0.9 }), "Формируем отчёт · 90%");
assert.equal(feedback.progress({ stage: "x", status: "failed", message: "CRH3 missing" }), "Ошибка: CRH3 missing");
assert.equal(feedback.progress({ stage: "x", status: "cancelled" }), "Отменено");
console.log("execution links, ambiguous fills, contextual equity panes and lifecycle feedback passed");
