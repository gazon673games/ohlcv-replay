const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const elements = {
  sourceLatency: { textContent: "" },
};
const context = vm.createContext({
  WorkbenchCore: { $: (id) => elements[id], fillSelect(select, items, preferred) {
    select.options = items; select.value = preferred || items[0]?.id || "";
  } },
  WorkbenchI18n: {
    t: (key, values = {}) => `${key}:${values.minutes ?? ""}`,
  },
  WorkbenchUX: { t: key => key },
});
const source = fs.readFileSync(path.join(__dirname, "web", "workbench_adapter_ui.js"), "utf8");
vm.runInContext(`${source}\nglobalThis.subject = WorkbenchAdapterUI;`, context);

assert.equal(context.subject.defaultEngine({ default_engine: "perpetual" }), "perpetual");
assert.equal(context.subject.defaultEngine({}), "");
context.subject.renderLatency({
  default_delay_minutes: 0,
  provider_supports_realtime: true,
  realtime_requires_subscription: false,
  adapter_realtime_enabled: false,
});
assert.equal(elements.sourceLatency.textContent, "delayedData:0 realtimeUnavailable:");
elements.tradingDaysPerYear = { value: "" };
elements.instrumentMode = { options: [] };
elements.chartTimeframeSelect = {};
elements.cachePolicy = { options: [] };
elements.rollRule = {};
for (const id of ["cachePolicyField", "rollRuleField", "rulesArchiveField"]) {
  elements[id] = { hidden: null, classList: { toggle(_name, hidden) { elements[id].hidden = hidden; } } };
}
elements.rulesEnforcement = { value: "strict" };
elements.requireQualityGate = { checked: true };
elements.qualityModeNote = { textContent: "" };
context.subject.applyCapabilities({ supports_rule_archive: true,
  default_rules_enforcement: "audit", default_quality_approval_required: false,
  execution_defaults: { trading_days_per_year: 365 } }, () => {});
assert.equal(elements.tradingDaysPerYear.value, 365);
assert.equal(elements.rulesArchiveField.hidden, false);
assert.equal(elements.rulesEnforcement.value, "audit");
assert.equal(elements.requireQualityGate.checked, false);
assert.match(elements.qualityModeNote.textContent, /researchMode/);
context.subject.applyCapabilities({}, () => {});
assert.equal(elements.tradingDaysPerYear.value, "");
assert.equal(elements.rulesArchiveField.hidden, true);
assert.equal(elements.rulesEnforcement.value, "strict");
assert.equal(elements.requireQualityGate.checked, true);
assert.equal(elements.qualityModeNote.textContent, "");
for (const id of ["commissionBps", "slippageTicks", "spreadTicks"]) elements[id] = { value: "" };
elements.instrumentMode.options = [{ value: "custom_contract" }, { value: "security" }];
context.subject.applyCapabilities({ default_instrument_mode: "custom_contract",
  execution_defaults: { commission_bps: 0.5, slippage_ticks: 1, bid_ask_spread_ticks: 1 } }, () => {});
context.subject.setInstrumentMode();
assert.equal(elements.instrumentMode.value, "custom_contract");
assert.equal(elements.commissionBps.value, 0.5);
context.subject.applyCapabilities({ default_instrument_mode: "security" }, () => {});
context.subject.setInstrumentMode();
assert.equal(elements.instrumentMode.value, "security");
assert.equal(elements.commissionBps.value, 0);
assert.equal(elements.slippageTicks.value, 0);
assert.equal(elements.spreadTicks.value, 0);
elements.archiveFallbackPolicy = {};
elements.archiveFallbackField = { hidden: false, classList: { toggle(_name, hidden) {
  elements.archiveFallbackField.hidden = hidden;
} } };
context.subject.applyCapabilities({ archive_fallback_policies: ["missing_only", "invalid_timestamps_and_missing_marks"],
  default_archive_fallback_policy: "invalid_timestamps_and_missing_marks" }, () => {});
assert.equal(elements.archiveFallbackPolicy.value, "invalid_timestamps_and_missing_marks");
assert.equal(elements.archiveFallbackField.hidden, false);
context.subject.applyCapabilities({}, () => {});
assert.equal(elements.archiveFallbackField.hidden, true);
process.stdout.write("adapter capability UI tests passed\n");
