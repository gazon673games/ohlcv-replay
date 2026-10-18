const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let styleReads = 0;
let buyColor = "#00aa00";
const document = { documentElement: { lang: "en" } };
const context = vm.createContext({ document, getComputedStyle: () => {
  styleReads++;
  return { getPropertyValue: name => name === "--price-up" ? buyColor : "#aa0000" };
} });
for (const name of ["workbench_time.js", "workbench_market_chart_data.js", "workbench_market_markers.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "web", name), "utf8"), context);
}
const { data, markers, time } = vm.runInContext(
  "({ data: WorkbenchMarketChartData, markers: WorkbenchMarketMarkers, time: WorkbenchTime })", context);
let formats = 0;
const format = time.formatMarketTime;
time.formatMarketTime = value => { formats++; return format(value); };
let builds = 0;
const index = data.markerIndex;
data.markerIndex = (...args) => { builds++; return index(...args); };

const start = Date.UTC(2024, 0, 2, 10) / 1000;
const candles = Array.from({ length: 32000 }, (_, i) => ({ time: start + i * 60 }));
const rows = candles.filter((_, i) => i % 4 === 0).map((candle, i) => ({
  fill_ts: candle.time, order_id: `execution-${i}`, filled_contract_delta: i % 2 ? -1 : 1,
  action: i % 2 ? "close_long" : "open_long",
}));
rows.push({ fill_ts: start, action: "open_long", filled_contract_delta: 0 });
const submissions = [];
const display = markers.create({ setMarkers: rows => submissions.push(rows) });
const range = (from, to) => ({ from: start + from * 60, to: start + to * 60 });
let stats = display.render(rows, candles, range(30000, 30800));
assert.equal(stats.markerCount, 8000, "complete execution count survives viewport culling");
assert.equal(submissions.at(-1).length, 201, "both boundary executions stay visible");
assert.equal(formats, 0, "dense views must not format any hidden labels");
assert.equal(styleReads, 2, "colors are read once per index, rather than once per fill");
assert.ok(submissions.at(-1).some(marker => marker.id === data.markerId(rows[7500], 7500)));
assert.ok(submissions.at(-1).some(marker => marker.time === start + 30800 * 60), "both boundary executions stay visible");
display.render(rows, candles, range(30000.1, 30800.1));
const previous = submissions.at(-1);
display.render(rows, candles, range(30000.2, 30800.2));
assert.strictEqual(submissions.at(-1), previous, "moving within the same marker boundaries does not resubmit data");
assert.equal(builds, 1, "panning must not rebuild the complete history");
display.render(rows, candles, range(0, 31999));
assert.equal(submissions.at(-1).length, 8000);
display.render(rows, candles, range(30000, 30800));
assert.equal(submissions.at(-1).length, 201, "zooming back in must discard offscreen markers");

stats = display.render(rows, candles, range(30000, 30076));
assert.equal(stats.markerLabelCount, 20);
assert.equal(formats, 20, "only visible labels are formatted");
const stableId = submissions.at(-1)[1].id;
display.render(rows, candles, range(30004, 30080));
assert.equal(formats, 21, "overlapping zoom views reuse labels");
assert.equal(submissions.at(-1)[0].id, stableId, "marker IDs preserve click-to-trade navigation");
document.documentElement.lang = "ru";
display.render(rows, candles, range(30004, 30080));
assert.match(submissions.at(-1)[1].text, /Лонг/u, "labels follow language changes");
assert.equal(builds, 1);
buyColor = "#00bb00";
display.invalidate();
display.render(rows, candles, range(30004, 30080));
assert.equal(submissions.at(-1)[1].color, buyColor, "theme changes refresh cached colors");

const selected = { time: start + 30040 * 60, id: "trade:7:0", shape: "circle", color: "#123456" };
display.render(rows, candles, range(30004, 30080), [selected]);
assert.ok(submissions.at(-1).some(marker => marker.id === selected.id));
display.render(rows, candles, range(32000, 32010));
assert.equal(submissions.at(-1).length, 0, "offscreen executions do not stay in the renderer");

display.invalidate();
const fill = { fill_ts: start + 600, filled_contract_delta: 1, execution_timing: "signal_close_to_same_close" };
display.render([fill], [{ time: start }, { time: start + 600 }], range(0, 10));
assert.equal(submissions.at(-1)[0].time, start, "new candle timelines remap close fills causally");
display.invalidate();
display.render([fill], [{ time: start }, { time: start + 300 }, { time: start + 600 }], range(0, 10));
assert.equal(submissions.at(-1)[0].time, start + 300);
display.reset();
assert.equal(submissions.at(-1).length, 0);
assert.equal(display.render([], [], null).markerCount, 0);
console.log("indexed marker viewport, labels, IDs and invalidation tests passed");
