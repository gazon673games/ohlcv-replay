const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const elements = {
  qualityDetails: { open: false },
  qualityModeNote: { textContent: "" },
  requireQualityGate: { checked: true, addEventListener(_type, listener) { this.listener = listener; } },
  runButton: { disabled: false },
};
const state = { dataset: { quality_status: "rejected" } };
const statuses = [];
const context = vm.createContext({
  WorkbenchCore: {
    $: (id) => elements[id],
    setStatus: (message, status) => statuses.push({ message, status }),
    state,
  },
  WorkbenchI18n: { t: (key, values = {}) => `${key}:${values.status || ""}` },
  WorkbenchUX: { t: key => key },
});
const source = fs.readFileSync(path.join(__dirname, "web", "workbench_quality_ui.js"), "utf8");
vm.runInContext(`${source}\nglobalThis.subject = WorkbenchQualityUI;`, context);

context.subject.init();
context.subject.update();
assert.equal(elements.runButton.disabled, true);
assert.equal(elements.qualityDetails.open, true);
assert.match(elements.qualityModeNote.textContent, /qualityDataInvalid/u);

elements.requireQualityGate.checked = false;
elements.requireQualityGate.listener();
assert.equal(elements.runButton.disabled, true);
assert.match(elements.qualityModeNote.textContent, /qualityDataInvalid/u);
state.dataset = { quality_status: "warning" };
context.subject.update();
assert.equal(elements.runButton.disabled, false);
assert.match(elements.qualityModeNote.textContent, /qualityDiagnosticMode/u);
assert.equal(statuses.length, 0, "readiness must not overwrite job completion or cancellation status");

elements.rulesEnforcement = { value: "strict", addEventListener(_type, listener) { this.listener = listener; } };
state.adapter = { capabilities: { supports_rule_archive: true } };
context.subject.init();
elements.rulesEnforcement.listener();
assert.equal(elements.requireQualityGate.checked, true);
assert.equal(elements.runButton.disabled, true);
assert.match(elements.runButton.title, /qualityRunBlocked/);
elements.rulesEnforcement.value = "audit";
elements.rulesEnforcement.listener();
assert.equal(elements.requireQualityGate.checked, false);
state.dataset = null;
context.subject.update();
assert.match(elements.qualityModeNote.textContent, /researchMode/);
let ready = { dataset: null, canPrepare: true, busy: false };
state.dataset = { quality_status: "rejected" };
context.subject.init({ readiness: () => ready });
context.subject.update();
assert.equal(elements.runButton.disabled, false, "chart quality cannot block another source timeframe");
assert.match(elements.qualityModeNote.textContent, /runDataPrepare/);
ready.busy = true;
context.subject.update();
assert.equal(elements.runButton.disabled, true);
ready = { dataset: { quality_status: "rejected" }, canPrepare: true, busy: false };
context.subject.update();
assert.equal(elements.runButton.disabled, true, "actual strategy inputs must still pass gates");
ready.dataset.quality_status = "warning";
context.subject.update();
assert.equal(elements.runButton.disabled, false);
elements.requireQualityGate.checked = true;
context.subject.update();
assert.equal(elements.runButton.disabled, true);
ready.dataset = { dataset_id: "native_1m", timeframe: "1m", quality_status: "warning" };
state.dataset = { dataset_id: "chart_5m", quality_status: "approved" };
context.subject.update();
assert.match(elements.qualityModeNote.textContent, /nextRunData \(1m\)/);
assert.match(elements.qualityModeNote.textContent, /chartQualitySeparate/);
assert.match(elements.runButton.title, /native_1m/);
process.stdout.write("quality gate UI tests passed\n");
