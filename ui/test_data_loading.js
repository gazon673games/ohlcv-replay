const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const state = {};
const cancelButton = { disabled: true };
const events = [];
let failure = "";
let current = true;
const cancelled = [];
const progress = { status: "completed", dataset_id: "new-chart" };
const context = vm.createContext({
  WorkbenchCore: { state, $: () => cancelButton, setStatus() {} },
  WorkbenchI18n: { t: key => key },
  WorkbenchApi: { async post(url, request) {
    if (url.endsWith("/cancel")) { cancelled.push(url); return {}; }
    assert.equal(url, "/api/datasets/build/async");
    assert.equal(request.security, "ETHUSDT");
    if (failure === "submit") throw new Error("submit failed");
    return { run_id: "download-job" };
  } },
  WorkbenchRunUI: { async pollJob(id, onProgress) {
    assert.equal(id, "download-job");
    assert.equal(state.currentJobId, id);
    assert.equal(cancelButton.disabled, false);
    if (failure === "poll") throw new Error("poll failed");
    if (failure === "stale-poll") current = false;
    if (onProgress) await onProgress(progress);
    return progress;
  } },
  WorkbenchDatasetBuildStream: {
    start: (id, label) => events.push(["start", id, label]),
    update: () => events.push(["update"]),
    finish: async id => events.push(["finish", id]),
    stop: () => events.push(["stop"]),
  },
});
vm.runInContext(fs.readFileSync("web/workbench_data_loading.js", "utf8") +
  "\nthis.subject = WorkbenchDataLoading;", context);

(async () => {
  assert.equal(await context.subject.download({ security: "ETHUSDT" }, "ETHUSDT"), progress);
  assert.deepEqual(events.map(event => event[0]), ["start", "update", "finish", "stop"]);
  assert.equal(state.currentJobId, null);
  events.length = 0;
  current = false;
  await context.subject.download({ security: "ETHUSDT" }, "ETHUSDT", { isCurrent: () => current });
  assert.equal(cancelled.length, 1, "a stale submit must be cancelled before preview starts");
  assert.ok(events.every(event => event[0] === "stop"));
  events.length = 0;
  current = true;
  failure = "stale-poll";
  await context.subject.download({ security: "ETHUSDT" }, "ETHUSDT", { isCurrent: () => current });
  assert.deepEqual(events.map(event => event[0]), ["start", "stop", "stop"],
    "stale progress must not append or finish the previous market preview");
  assert.equal(cancelButton.disabled, true);
  events.length = 0;
  assert.equal(await context.subject.download({ security: "ETHUSDT" }, "ETHUSDT",
    { preview: false }), progress);
  assert.equal(events.length, 0, "preparing strategy data must preserve the loaded chart");
  assert.equal(state.currentJobId, null);
  for (const mode of ["submit", "poll"]) {
    failure = mode;
    await assert.rejects(context.subject.download({ security: "ETHUSDT" }, "ETHUSDT"), /failed/);
    assert.equal(events.at(-1)[0], "stop");
    assert.equal(state.currentJobId, null);
    assert.equal(cancelButton.disabled, true);
  }
  process.stdout.write("dataset download lifecycle tests passed\n");
})().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
