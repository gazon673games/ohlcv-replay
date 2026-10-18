const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const series = [];
let clicked;
let rangeChanged;
let renderedMarkers = [];
const visibleRange = { from: 100, to: 200 };
let range = visibleRange;
const timeScale = {
  subscribeVisibleTimeRangeChange(listener) { rangeChanged = listener; },
  getVisibleRange: () => range,
  getVisibleLogicalRange: () => ({ from: 0, to: 10 }),
  setVisibleRange(value) { range = value; },
};
const chart = {
  subscribeClick(callback) { clicked = callback; },
  removeSeries() {},
  timeScale: () => timeScale,
  panes: () => [],
  addSeries() {
    const item = {
      rows: [], setCalls: 0, updateCalls: 0, submittedPoints: 0,
      applyOptions() {},
      setData(rows) {
        this.rows = [...rows];
        this.setCalls += 1;
        this.submittedPoints += rows.length;
      },
      update(row) {
        const last = this.rows.at(-1);
        assert.ok(!last || row.time >= last.time, "updates must preserve chronological order");
        if (last?.time === row.time) this.rows[this.rows.length - 1] = row;
        else this.rows.push(row);
        this.updateCalls += 1;
        this.submittedPoints += 1;
      },
    };
    series.push(item);
    return item;
  },
};
const frames = [];
const context = vm.createContext({
  console, performance,
  document: {
    documentElement: { lang: "en" },
    getElementById: () => ({ clientWidth: 800, clientHeight: 600 }),
  },
  getComputedStyle: () => ({ getPropertyValue: () => "#21252C" }),
  requestAnimationFrame: (fn) => frames.push(fn),
  cancelAnimationFrame() {}, clearTimeout() {},
  window: { LightweightCharts: {
    ColorType: { Solid: "solid" }, CrosshairMode: { Normal: 0 },
    createChart: () => chart,
    createSeriesMarkers: () => ({ setMarkers(rows) { renderedMarkers = rows; } }),
  } },
});
for (const name of ["workbench_time.js", "workbench_market_chart_data.js", "workbench_equity_pane.js", "workbench_market_markers.js", "workbench_market_chart.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "web", name), "utf8"), context);
}
const subject = vm.runInContext("WorkbenchMarketChart", context);

function candle(index, close = 100) {
  return {
    ts: new Date(Date.UTC(2024, 0, 2, 10) + index * 60000).toISOString(),
    open: close, high: close, low: close, close,
  };
}

subject.setCandles([candle(0), candle(1)]);
subject.setEquity([{ ...candle(0), equity_cash: 1000 }]);
const [candles, equity] = series;
const candleSetCalls = candles.setCalls;
const equitySetCalls = equity.setCalls;
subject.appendCandles([
  candle(3), candle(0, 99), candle(2), candle(1, 101), candle(3, 103.1234),
  { ...candle(4), close: null },
]);
subject.appendEquity([
  { ...candle(2), equity_cash: 1002 },
  { ...candle(0), equity_cash: 999 },
  { ...candle(1), equity_cash: 1001 },
  { ...candle(2), equity_cash: 1003 },
]);
assert.deepEqual(candles.rows.map((row) => row.close), [100, 101, 100, 103.1234]);
assert.deepEqual(equity.rows.map((row) => row.value), [999, 1001, 1003]);
assert.equal(subject.stats().candleCount, 4);
assert.equal(subject.stats().equityCount, 3);
assert.equal(subject.stats().pricePrecision, 4);
assert.strictEqual(subject.getVisibleRange().from, visibleRange.from);
subject.appendCandles([candle(0, 200)]);
subject.appendEquity([{ ...candle(0), equity_cash: 0 }]);
subject.appendCandles([]);
subject.appendEquity([]);
assert.equal(candles.setCalls, candleSetCalls, "append must not resubmit the candle history");
assert.equal(equity.setCalls, equitySetCalls, "append must not resubmit the equity history");
assert.equal(candles.rows[0].close, 100, "old candles remain unchanged");
assert.equal(equity.rows[0].value, 999, "old equity points remain unchanged");

subject.setCandlesPreservingRange([candle(10), candle(11)]);
frames.splice(0).forEach((fn) => fn());
assert.equal(candles.rows.length, 2);
assert.equal(subject.stats().firstCandleTime, candles.rows[0].time);
assert.equal(subject.getVisibleRange().from, visibleRange.from);

subject.reset();
assert.equal(candles.rows.length, 0);
assert.equal(equity.rows.length, 0);
assert.equal(subject.stats().candleCount, 0);
assert.equal(subject.stats().equityCount, 0);
const submittedBefore = candles.submittedPoints;
for (let start = 0; start < 32000; start += 1000) {
  subject.appendCandles(Array.from({ length: 1000 }, (_, index) => candle(start + index)));
}
assert.equal(subject.stats().candleCount, 32000);
let markerEvent;
subject.onMarkerClick((id, decisions) => { markerEvent = { id, decisions }; });
clicked({ hoveredObjectId: 17 });
assert.equal(markerEvent, undefined, "unrelated chart objects do not trigger trade navigation");
clicked({ hoveredObjectId: "trade:0:1" });
assert.equal(markerEvent.id, "trade:0:1");
assert.equal(candles.submittedPoints - submittedBefore, 32000,
  "32000 streamed candles must submit only 32000 points across all batches");
range = { from: candles.rows[0].time, to: candles.rows[15].time };
subject.setDecisions([{ fill_ts: candles.rows[10].time, filled_contract_delta: 1,
  execution_timing: "signal_close_to_same_close" }]);
assert.equal(renderedMarkers[0].time, candles.rows[9].time);
subject.setCandlesPreservingRange([candle(0), candle(5), candle(10), candle(15)]);
assert.equal(renderedMarkers[0].time, candles.rows[1].time,
  "replacing chart candles must invalidate execution mappings for the old timeframe");
rangeChanged({ from: candles.rows[2].time, to: candles.rows[3].time });
frames.splice(0).forEach(fn => fn());
assert.equal(renderedMarkers.length, 0);
assert.equal(subject.stats().markerCount, 1, "offscreen executions stay in chart statistics");
subject.reset();
assert.equal(renderedMarkers.length, 0);
console.log("market chart append, replacement, reset and work bounds passed");
