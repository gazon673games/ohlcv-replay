const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({
  console,
  document: { documentElement: { lang: "en" } },
  getComputedStyle: () => ({
    getPropertyValue: (name) => ({
      "--price-up": "#00aa00",
      "--price-down": "#aa0000",
      "--warning": "#ffaa00",
    })[name] || "#000000",
  }),
});
const timeSource = fs.readFileSync(path.join(__dirname, "web", "workbench_time.js"), "utf8");
const source = fs.readFileSync(path.join(__dirname, "web", "workbench_market_chart_data.js"), "utf8");
vm.runInContext(`${timeSource}\n${source}\nglobalThis.subject = WorkbenchMarketChartData;`, context);

assert.equal(
  context.subject.timestamp("2026-07-20T11:30:00"),
  Date.UTC(2026, 6, 20, 11, 30) / 1000,
  "exchange-local wall time must not be shifted by the browser timezone",
);

const candles = [
  { time: epoch("2026-01-05T10:00:00") },
  { time: epoch("2026-01-05T10:45:00") },
  { time: epoch("2026-01-05T11:30:00") },
  { time: epoch("2026-01-05T11:35:00") },
];
const actions = [
  execution("2026-01-05T10:30:00", "2026-01-05T11:20:00", 1, "open_long"),
  execution("2026-01-05T11:25:00", "2026-01-05T11:25:00", -1, "close_long"),
  execution("2026-01-05T11:25:00", "2026-01-05T11:25:00", 1, "open_long"),
  execution("2026-01-05T11:30:00", "2026-01-05T11:35:00", -1, "close_long", "signal_close_to_next_bar_close"),
  execution("2026-01-05T11:30:00", "2026-01-05T11:35:00", 1, "open_long", "signal_close_to_next_bar_open_to_close"),
  { ...execution("2026-01-05T11:25:00", "2026-01-05T11:25:00", 1, "open_long"), filled_contract_delta: 0, order_filled: false },
];

const markers = context.subject.markerRows(actions, candles);
assert.equal(markers.length, 5, "unfilled actions must not create markers");
assert.deepEqual(
  markers.map((marker) => marker.time),
  [candles[1].time, candles[1].time, candles[1].time, candles[2].time, candles[3].time],
  "close fills belong to the closing bar while open fills belong to the bar starting at fill time",
);
assert.deepEqual(
  markers.map(({ position, shape, color }) => ({ position, shape, color })),
  [
    { position: "belowBar", shape: "arrowUp", color: "#00aa00" },
    { position: "aboveBar", shape: "arrowDown", color: "#aa0000" },
    { position: "belowBar", shape: "arrowUp", color: "#00aa00" },
    { position: "aboveBar", shape: "arrowDown", color: "#aa0000" },
    { position: "belowBar", shape: "arrowUp", color: "#00aa00" },
  ],
  "marker direction must describe the executed buy or sell",
);
assert.match(markers[0].text, /Long.*11:20/u, "marker text must show action and fill time");
assert.ok(markers[0].text.length < 24, "marker text must not visually drift far from its arrow");
assert.equal(new Set(markers.map((marker) => marker.id)).size, markers.length, "markers need stable unique IDs");

const denseActions = Array.from({ length: 100 }, (_value, index) => execution(
  `2026-01-05T10:${String(index % 60).padStart(2, "0")}:00`,
  `2026-01-05T10:${String(index % 60).padStart(2, "0")}:00`,
  index % 2 ? -1 : 1,
  index % 2 ? "close_long" : "open_long",
));
const denseMarkers = context.subject.markerRows(denseActions, candles);
assert.equal(denseMarkers.filter((marker) => marker.text).length, 0, "full-range labels stay bounded");
const zoomedMarkers = context.subject.markerRows(denseActions, candles, {
  from: candles[1].time,
  to: candles[1].time,
});
assert.ok(
  zoomedMarkers.some((marker) => marker.time === candles[1].time && marker.text),
  "zoomed executions must regain their action labels",
);

function execution(ts, fillTs, delta, action, executionTiming) {
  return {
    ts,
    fill_ts: fillTs,
    contract_delta: delta,
    filled_contract_delta: delta,
    order_filled: true,
    action,
    execution_timing: executionTiming,
  };
}

function epoch(value) {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, second) / 1000;
}

process.stdout.write("market chart action-marker tests passed\n");
