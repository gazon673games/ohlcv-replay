const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = {
  console,
  WorkbenchChartPrimitives: { timestamp: Number, resolveColor: (color) => color },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("web/workbench_chart_series.js", "utf8"), context);
const chartSeries = vm.runInContext("WorkbenchChartSeries", context);

const rows = [0, 0, 30, 30, -30, -30].map((target_contracts, ts) => ({
  ts,
  target_contracts,
}));
const transitions = chartSeries.transitionRows(rows, "target_contracts");
assert.deepStrictEqual(
  Array.from(transitions, (row) => row.ts),
  [0, 2, 4, 5],
);

const large = Array.from({ length: 200000 }, (_value, index) => index - 100000);
assert.deepStrictEqual(
  Array.from(chartSeries.numericRange(large, true)),
  [-100000, 99999],
);

const segments = [];
let current = [];
const drawing = {
  beginPath: () => { current = []; },
  moveTo: (x, y) => current.push([x, y]),
  lineTo: (x, y) => current.push([x, y]),
  stroke: () => segments.push({ color: drawing.strokeStyle, points: current }),
};
chartSeries.drawLineSeries(drawing, {
  visible: [
    { ts: 0, target_contracts: 0 },
    { ts: 1, target_contracts: 1 },
    { ts: 2, target_contracts: -1 },
    { ts: 3, target_contracts: -1 },
  ],
  column: "target_contracts",
  stepped: true,
  positionState: true,
  positionColors: { long: "green", flat: "gray", short: "red" },
}, Number, (value) => value * 10, 100, 1);
assert.deepStrictEqual(segments.map((segment) => segment.color), ["gray", "green", "red"]);
assert.ok(segments.every((segment) => segment.points[0][1] === segment.points[1][1]));

console.log("chart series tests passed");
