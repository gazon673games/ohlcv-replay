const assert = require("node:assert/strict");
const params = require("./web/workbench_strategy_params.js");

const specs = [
  { name: "sma_period", param_type: "int", default: 42 },
  { name: "use_long_filter", param_type: "bool", default: true },
  { name: "new_parameter", param_type: "str", default: "default-value" },
];
const resolved = params.resolve(specs, { sma_period: "48", use_long_filter: false });

assert.deepEqual(resolved, {
  sma_period: "48",
  use_long_filter: false,
  new_parameter: "default-value",
});
assert.equal(params.checked(false), false, "a saved false value must remain unchecked");
assert.equal(params.checked("false"), false, "a serialized false value must remain unchecked");
assert.equal(params.checked("true"), true);
assert.deepEqual(params.collect([
  { dataset: { param: "sma_period" }, type: "text", value: "48" },
  { dataset: { param: "use_long_filter" }, type: "checkbox", checked: false },
]), { sma_period: "48", use_long_filter: false });

process.stdout.write("strategy parameter state tests passed\n");
