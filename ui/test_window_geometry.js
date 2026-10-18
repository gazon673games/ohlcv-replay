const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync("web/workbench_window_geometry.js", "utf8"), context);
const geometry = vm.runInContext("WorkbenchWindowGeometry", context);
for (const original of [{ x: 100, y: 80, width: 500, height: 300 },
  { x: -2000, y: 1500, width: 3200, height: 2400 }]) {
  assert.deepEqual(JSON.parse(JSON.stringify(geometry.normalize(original))), original,
    "valid workspace coordinates and sizes must survive normalization");
  for (const corner of ["nw", "ne", "sw", "se"]) {
    for (const dx of [-10000, -20, 20, 10000]) {
      for (const dy of [-10000, -20, 20, 10000]) {
        const result = geometry.resize(original, corner, dx, dy);
        assert.ok(result.width >= 280 && result.height >= 160, corner);
        assert.ok(Object.values(result).every(Number.isFinite));
        assert.equal(corner.includes("w") ? result.x + result.width : result.x,
          corner.includes("w") ? original.x + original.width : original.x, "opposite horizontal edge moved");
        assert.equal(corner.includes("n") ? result.y + result.height : result.y,
          corner.includes("n") ? original.y + original.height : original.y, "opposite vertical edge moved");
      }
    }
  }
}
const original = { x: 100, y: 80, width: 500, height: 300 };
const larger = geometry.resize(original, "se", 10000, 10000);
assert.equal(larger.width, 10500); assert.equal(larger.height, 10300);
const negative = geometry.resize(original, "nw", -10000, -10000);
assert.equal(negative.x, -9900); assert.equal(negative.y, -9920);
const view = { scale: 1, x: 0, y: 0 };
const zoomed = geometry.zoom(view, 0.5, 300, 200);
assert.equal(zoomed.scale, 0.5);
assert.equal((300 - zoomed.x) / zoomed.scale, 300, "pointer's workspace x changed");
assert.equal((200 - zoomed.y) / zoomed.scale, 200, "pointer's workspace y changed");
const restored = geometry.zoom(zoomed, 2, 300, 200);
assert.equal(restored.scale, 1); assert.equal(restored.x, 0); assert.equal(restored.y, 0);
assert.equal(geometry.zoom(view, 1e-10, 0, 0).scale, 0.25);
assert.equal(geometry.zoom(view, 1e10, 0, 0).scale, 2);
console.log("unbounded coordinates, four-corner resize anchors, minimum sizes and pointer-anchored zoom passed");
