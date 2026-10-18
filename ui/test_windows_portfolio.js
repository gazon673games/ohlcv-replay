const assert = require("node:assert/strict");
require("./test_window_geometry");
const fs = require("node:fs");
const vm = require("node:vm");
const context = vm.createContext({ console });
vm.runInContext(fs.readFileSync("web/workbench_window_geometry.js", "utf8") + "\nglobalThis.geometry = WorkbenchWindowGeometry;", context);
const { geometry } = context;
assert.deepEqual(JSON.parse(JSON.stringify(geometry.normalize({ x: 9999, y: -1, width: NaN, height: 9000 }))),
  { x: 9999, y: -1, width: 600, height: 9000 });
for (const rect of geometry.tile(4, 1000, 600)) {
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 1000 && rect.y + rect.height <= 600);
}
assert.equal(geometry.tile(0, 500, 500).length, 0);
vm.runInContext(fs.readFileSync("web/workbench_portfolio_model.js", "utf8") + "\nglobalThis.model = WorkbenchPortfolioModel;", context);
const { model } = context;
const request = model.fresh();
assert.throws(() => model.validate(request), /Add instruments/);
request.config.legs.push({ asset_id: "A" }, { asset_id: "B" });
request.config.strategy.sdk_sleeves.push({ initial_capital: 250 }, { initial_capital: 200 });
assert.equal(model.validate(request).config.portfolio.initial_capital, 700);
request.config.portfolio.initial_capital = 400;
assert.throws(() => model.validate(request), /Budgets exceed/);
request.config.portfolio.initial_capital = 700;
request.config.legs[1].asset_id = "A";
assert.throws(() => model.validate(request), /Duplicate/);
const item = { dataset_id: "fixture", continuous_symbol: "A", quality_approval_path: "approval.json", catalog_path: "catalog.json" };
assert.equal(model.datasetLeg(item, false).catalog_enforcement, "strict");
assert.equal(model.datasetLeg(item, true).quality_approval_path, null);
console.log("window bounds, tiling, portfolio budgets and explicit diagnostic gates passed");
