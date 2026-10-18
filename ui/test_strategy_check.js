const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const listeners = {};
const button = { disabled: false };
const status = { textContent: "" };
let source = "draft";
const context = vm.createContext({
  document: { getElementById(id) {
    if (id === "metadataButton") return button;
    if (id === "strategyCheckStatus") return status;
    return { addEventListener(event, callback) { listeners[id + event] = callback; } };
  } },
  window: { addEventListener(event, callback) { listeners[event] = callback; } },
  WorkbenchEditor: { getSource: () => source }, WorkbenchUX: { t: key => key },
});
vm.runInContext(fs.readFileSync("web/workbench_strategy_check.js", "utf8"), context);
const subject = vm.runInContext("WorkbenchStrategyCheck", context);
subject.init();
(async () => {
  let finish;
  let calls = 0;
  const refresh = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  let pending = subject.validate(refresh);
  assert.equal(button.disabled, true);
  assert.equal(status.textContent, "checkingStrategy");
  await subject.validate(refresh);
  assert.equal(calls, 1, "repeated validation clicks must not overlap");
  listeners.paramControlsinput();
  finish(); await pending;
  assert.equal(status.textContent, "strategyChanged", "edited parameters must not be labeled validated");
  pending = subject.validate(refresh);
  source = "changed source";
  listeners["workbench-source-change"]();
  finish(); await pending;
  assert.equal(status.textContent, "strategyChanged");
  await subject.validate(async () => {});
  assert.equal(status.textContent, "strategyChecked");
  listeners.strategyLanguagechange();
  assert.equal(status.textContent, "");
  await subject.validate(async () => { throw new Error("syntax error at line 7"); });
  assert.equal(button.disabled, false);
  assert.match(status.textContent, /strategyCheckFailed: syntax error at line 7/);
  console.log("strategy validation feedback, concurrent clicks and edited drafts passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
