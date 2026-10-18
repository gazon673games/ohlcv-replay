const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = vm.createContext({
  document: { documentElement: { lang: "en" } },
  getComputedStyle: () => ({ getPropertyValue: () => "#123456" }),
});
for (const file of ["workbench_time", "workbench_market_chart_data", "workbench_chart_navigation"]) {
  vm.runInContext(fs.readFileSync(`web/${file}.js`, "utf8"), context);
}
const subject = vm.runInContext("WorkbenchChartNavigation", context);
const candles = Array.from({ length: 40 }, (_, index) => ({ time: 1000 + index * 60 }));
const trade = { trade_id: 5, direction: "long", entry_ts: 1600, exit_ts: 2200 };
const selected = subject.tradeSelection(candles, trade, "signal_close_to_next_bar_open");
assert.ok(selected.range.from < 1600 && selected.range.to > 2200);
assert.deepEqual(Array.from(selected.markers, row => row.time), [1600, 2200]);
assert.equal(selected.markers[0].position, "belowBar");
assert.equal(selected.markers[1].position, "aboveBar");
const close = subject.tradeSelection(candles, trade, "signal_close_to_next_bar_close");
assert.deepEqual(Array.from(close.markers, row => row.time), [1540, 2140],
  "close fills belong to the preceding candle, never a future bar");
const coarse = subject.tradeSelection(candles, { ...trade, entry_ts: 1625, exit_ts: 2210 });
assert.deepEqual(Array.from(coarse.markers, row => row.time), [1600, 2200]);
assert.equal(subject.tradeSelection(candles, { ...trade, entry_ts: 999 }), null);
assert.equal(subject.tradeSelection(candles, { ...trade, exit_ts: 5000 }), null);
assert.equal(subject.tradeSelection(candles, { ...trade, exit_ts: null }), null);
assert.equal(subject.tradeSelection(candles, { ...trade, exit_ts: 1500 }), null);
assert.equal(subject.tradeSelection([], trade), null);
assert.equal(subject.tradeSelection(candles, { ...trade, direction: "short" }).markers[0].position, "aboveBar");

let range = { from: 10, to: 30 };
const chart = { timeScale: () => ({
  getVisibleLogicalRange: () => range,
  setVisibleLogicalRange: next => { range = next; },
}) };
subject.control(chart, {}, "in");
assert.equal(range.to - range.from, 16);
subject.control(chart, {}, "out");
assert.equal(range.to - range.from, 20);
subject.control(chart, {}, "left");
assert.equal(range.from, 6);
subject.control(chart, {}, "right");
assert.equal(range.from, 10);
let options;
subject.control(chart, { priceScale: () => ({ applyOptions: value => { options = value; } }) }, "auto");
assert.equal(options.autoScale, true);
console.log("trade navigation, causal candle mapping and viewport controls passed");
