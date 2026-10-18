const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const elements = new Map();
const ids = [
  "metadataButton", "saveStrategyButton", "newStrategyButton", "loadStrategyButton",
  "strategySelect", "strategyName", "strategyTags", "paramControls",
  "strategyContractSummary", "strategyLanguage",
  "sdkCatalogError", "saveSdkSourceButton", "downloadSdkSourceButton",
  "sdkSourceFile", "sdkSourceFiles", "sdkSourceLocation",
];
ids.forEach((id) => elements.set(id, element()));
let controls = [];
let savedRequest = null;
let selectedRecord = {};
let editorSource = "strategy source";
let refreshedList = null;
const metadata = {
  timeframe: "5m",
  schedule: "times",
  decision_times: ["13:30"],
  params: [
    { name: "sma_period", param_type: "int", default: 42 },
    { name: "use_long_filter", param_type: "bool", default: true },
  ],
};
const context = vm.createContext({
  console,
  setInterval(callback) { refreshedList = callback; },
  document: {
    addEventListener() {},
    getElementById: (id) => elements.get(id),
    querySelectorAll: () => controls,
  },
  WorkbenchCore: {
    $: (id) => elements.get(id),
    escapeHtml: (value) => String(value),
    fillSelect: () => {},
    setStatus: () => {},
  },
  WorkbenchEditor: {
    init() {}, getSource: () => editorSource, setSource(value) { editorSource = value; },
    getLanguage: () => "python", setLanguage() {},
  },
  WorkbenchI18n: { t: (key) => key },
  WorkbenchApi: {
    safeGet: async () => ({ items: [] }),
    get: async () => selectedRecord,
    post: async (url, request) => {
      if (url === "/api/strategy-metadata") return { metadata };
      savedRequest = request;
      return { strategy: { id: "fixture", name: "fixture", version: 1, metadata, params: request.params } };
    },
  },
});
const paramsSource = fs.readFileSync(path.join(__dirname, "web", "workbench_strategy_params.js"), "utf8");
const uiSource = fs.readFileSync(path.join(__dirname, "web", "workbench_strategy_ui.js"), "utf8");
vm.runInContext(`${paramsSource}\n${uiSource}\nglobalThis.subject = WorkbenchStrategyUI;`, context);

(async () => {
  await context.subject.init();
  controls = [
    { dataset: { param: "sma_period" }, type: "text", value: "48" },
    { dataset: { param: "use_long_filter" }, type: "checkbox", checked: false },
  ];

  await context.subject.refreshMetadata();

  assert.match(elements.get("paramControls").innerHTML, /value="48"/u);
  assert.doesNotMatch(
    elements.get("paramControls").innerHTML,
    /data-param="use_long_filter" checked/u,
  );
  const originalPost = context.WorkbenchApi.post;
  let finishValidation;
  context.WorkbenchApi.post = async () => new Promise(resolve => { finishValidation = resolve; });
  const pendingValidation = context.subject.refreshMetadata();
  controls[0].value = "49";
  finishValidation({ metadata });
  await pendingValidation;
  assert.match(elements.get("paramControls").innerHTML, /value="49"/u, "validation restored stale parameters");
  context.WorkbenchApi.post = async () => { throw new Error("invalid edited code"); };
  await assert.rejects(context.subject.refreshMetadata(), /invalid edited code/);
  assert.match(elements.get("paramControls").innerHTML, /value="49"/u, "failed validation erased parameter draft");
  controls[0].value = "48";
  context.WorkbenchApi.post = originalPost;
  await elements.get("saveStrategyButton").listeners.click();
  assert.deepEqual(
    JSON.parse(JSON.stringify(savedRequest.params)),
    { sma_period: "48", use_long_filter: false },
  );
  metadata.decision_time_param = "decision_time";
  metadata.decision_times = ["15:00"];
  metadata.params.push({ name: "decision_time", param_type: "str", default: "15:00" });
  controls.push({ dataset: { param: "decision_time" }, type: "text", value: "15:10" });
  await context.subject.refreshMetadata();
  assert.equal(elements.get("strategyContractSummary").textContent, "5m | 15:10");
  controls[2].value = "14:40";
  elements.get("paramControls").listeners.input();
  assert.equal(elements.get("strategyContractSummary").textContent, "5m | 14:40");
  await elements.get("saveStrategyButton").listeners.click();
  assert.equal(savedRequest.params.decision_time, "14:40");
  assert.equal(savedRequest.language, "python");
  selectedRecord = { id: "sdk:example", name: "SDK: example", origin: "sdk-catalog",
    source: 'SDK_CATALOG_STRATEGY = "example"', language: "python", params: {},
    editor_source: "def generate_signal(ctx, params): return 1",
    sdk_editor: { id: "sdk:example", module: "example", location: "catalog", revisions: {},
      snapshot: { name: "example", module: "example", defaults: { nullable: null, allowed: true },
        files: { example: "def generate_signal(ctx, params): return 1", _helper: "VALUE = 2" } } } };
  elements.get("strategySelect").value = "sdk:example";
  await elements.get("strategySelect").listeners.change();
  assert.match(editorSource, /def generate_signal/);
  editorSource = "def generate_signal(ctx, params): return 7";
  assert.match(context.subject.sourceForRun(), /return 7/);
  assert.match(context.subject.sourceForRun(), /None/);
  assert.match(context.subject.sourceForRun(), /True/);
  elements.get("sdkSourceFile").value = "_helper";
  elements.get("sdkSourceFile").listeners.change();
  assert.equal(editorSource, "VALUE = 2");
  elements.get("sdkSourceFile").value = "example";
  elements.get("sdkSourceFile").listeners.change();
  assert.match(editorSource, /return 7/);
  await refreshedList();
  assert.equal(elements.get("strategySelect").value, "sdk:example");
  await elements.get("saveStrategyButton").listeners.click();
  assert.equal(savedRequest.id, null, "saving a catalog selection creates a separate preset");
  elements.get("newStrategyButton").listeners.click();
  assert.match(context.subject.sourceForRun(), /VALUE = 2/);
  assert.match(context.subject.sourceForRun(), /return 7/);
  assert.equal(elements.get("saveSdkSourceButton").hidden, true);
  process.stdout.write("strategy UI parameter preservation tests passed\n");
})().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});

function element() {
  return {
    className: "",
    innerHTML: "",
    listeners: {},
    options: [],
    textContent: "",
    value: "",
    addEventListener(type, listener) { this.listeners[type] = listener; },
  };
}
