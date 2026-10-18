const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

let crosshair;
let writes = 0;
let readoutText = "";
const elements = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, { addEventListener() {}, querySelector() {},
    get textContent() { return readoutText; }, set textContent(value) { writes++; readoutText = value; } });
  return elements.get(id);
}
const frames = [];
const context = vm.createContext({ WorkbenchCore: { $: element },
  WorkbenchMarketChart: { onCrosshairMove: listener => { crosshair = listener; } },
  document: { addEventListener() {} },
  requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
});
for (const name of ["workbench_time.js", "workbench_chart_controls.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "web", name), "utf8"), context);
}
vm.runInContext("WorkbenchChartControls.init()", context);
const time = Date.UTC(2024, 0, 2, 10) / 1000;
const candle = { open: 100, high: 101, low: 99, close: 100 };
for (let i = 0; i < 120; i++) crosshair(time, { ...candle });
assert.equal(frames.length, 1, "moving within one candle queues one readout update");
frames.shift()();
assert.equal(writes, 1);
assert.match(readoutText, /02\.01\.2024 10:00.*C 100/u);
crosshair(time, { ...candle });
assert.equal(frames.length, 0);
crosshair(time, { ...candle, close: 100.5 });
crosshair(time + 60, { ...candle, close: 101 });
assert.equal(frames.length, 1, "fast movements coalesce into the latest visible candle");
frames.shift()();
assert.match(readoutText, /10:01.*C 101/u);
crosshair(undefined, undefined);
frames.shift()();
assert.equal(readoutText, "", "leaving the plot clears the readout");
assert.equal(writes, 3);
console.log("crosshair readout coalescing and live candle updates passed");
