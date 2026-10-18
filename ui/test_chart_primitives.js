const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const context = {
  console,
  document: { documentElement: {} },
  getComputedStyle: () => ({ getPropertyValue: () => "#111" }),
  window: { devicePixelRatio: 2 },
  WorkbenchTime: { marketTimestampMilliseconds: (value) => Number(value) },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("web/workbench_chart_primitives.js", "utf8"), context);
const primitives = vm.runInContext("WorkbenchChartPrimitives", context);

let heightAttribute = "170";
const canvas = {
  dataset: {},
  style: {},
  width: 0,
  height: 0,
  getAttribute: (name) => (name === "height" ? heightAttribute : null),
  getBoundingClientRect: () => ({ width: 500 }),
  getContext: () => ({ fillRect() {}, fillStyle: "" }),
};
Object.defineProperty(canvas, "height", {
  get: () => Number(heightAttribute),
  set: (value) => { heightAttribute = String(value); },
});

primitives.prepareCanvas(canvas);
primitives.prepareCanvas(canvas);

assert.strictEqual(canvas.width, 1000);
assert.strictEqual(canvas.height, 340);
assert.strictEqual(canvas.style.height, "170px");
assert.strictEqual(canvas.dataset.logicalHeight, "170");
const constantScale = primitives.yScale(canvas, 0, 0);
assert.ok(Number.isFinite(constantScale(0)));
assert.strictEqual(primitives.previousRow([{ ts: 10 }, { ts: 20 }], 19).ts, 10);
assert.strictEqual(primitives.resolveColor("--drawdown"), "#111");
context.getComputedStyle = () => ({ getPropertyValue: () => "#C63130" });
assert.strictEqual(primitives.resolveColor("--drawdown"), "#C63130");
assert.strictEqual(primitives.resolveColor("#123456"), "#123456");

console.log("chart primitives tests passed");
