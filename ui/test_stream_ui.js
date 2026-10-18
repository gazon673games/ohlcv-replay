const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const calls = [];
const elements = {
  dataFromDate: { value: "2026-07-20" },
  dataTillDate: { value: "2026-07-22" },
  chartTimeframeSelect: { value: "5m" },
  marketChart: { clientWidth: 1200 },
  marketTitle: {}, marketSubtitle: {}, workspaceProgress: {}, chartProgressLabel: {},
  chartEmptyState: { classList: { add() {}, remove() {} } }, metrics: { innerHTML: "" },
};
const chart = new Proxy({}, { get: (_target, name) => (...args) => calls.push([name, ...args]) });
chart.getVisibleRange = () => null;
const context = vm.createContext({
  console,
  URLSearchParams,
  requestAnimationFrame: (callback) => callback(),
  WorkbenchCore: {
    $: (id) => elements[id], setError() {}, setStatus() {}, state: {},
  },
  WorkbenchI18n: { t: (key) => key },
  WorkbenchMarketChart: chart,
  WorkbenchChartOverlays: {
    appendQuery: (query) => query,
    render: (...args) => calls.push(["renderOverlays", ...args]),
    reset: () => calls.push(["resetOverlays"]),
  },
  WorkbenchApi: {
    get: async () => ({
      rows: [{ ts: "2026-07-20T11:30:00", open: 1, high: 2, low: 1, close: 2 }],
      preview_row_count: 1, range_source_row_count: 1, timeframe: "5m", done: true,
    }),
  },
});
const source = fs.readFileSync(path.join(__dirname, "web", "workbench_stream_ui.js"), "utf8");
vm.runInContext(`${source}\nglobalThis.subject = WorkbenchStreamUI;`, context);

(async () => {
  const dataset = { dataset_id: "same", dataset_path: "C:\\data\\same.parquet", timeframe: "5m", row_count: 1 };
  await context.subject.loadDataset(dataset);
  calls.length = 0;
  context.subject.renderReport({
    config: { dataset: { path: "C:\\data\\same.parquet" } },
    tables: { decision_actions: [{ ts: "2026-07-20T11:30:00" }] },
    series: { equity: [{ ts: "2026-07-20T11:35:00", equity_cash: 1 }] },
  });
  assert.ok(calls.some(([name]) => name === "setDecisions"));
  assert.ok(calls.some(([name]) => name === "setEquity"));
  assert.equal(calls.some(([name]) => name === "setCandles"), false, "run report must not reload loaded candles");
  assert.equal(calls.some(([name]) => name === "fitContent"), false, "run report must preserve zoom");
  const metadata = { adapter_id: "binance", security: "ETHUSDT" };
  await context.subject.loadDataset({ ...dataset, metadata, engine: "perpetual" });
  context.WorkbenchCore.state.runDataset = { dataset_path: "native-4h.parquet", metadata,
    engine: "perpetual" };
  calls.length = 0;
  context.subject.renderReport({ config: { dataset: { path: "native-4h.parquet" } },
    series: { candles: [{ ts: "replacement" }] } });
  assert.equal(calls.some(([name]) => name === "setCandles"), false,
    "native strategy data must preserve the independently loaded chart");
  context.subject.renderReport({ config: { dataset: { path: "other-market.parquet" } },
    series: { candles: [{ ts: "other-market" }] } });
  assert.equal(calls.some(([name]) => name === "setCandles"), true,
    "an unrelated report must not retain another market's chart");
  assert.equal(context.subject.canReloadDataset(), false, "archived report must not reload another market's preview");
  await testDisplayReloadKeepsReport(dataset);
  await testHistoricalBatches(dataset);
  await testDatasetBuildPreviewIsolation();
  process.stdout.write("stream report preservation tests passed\n");
})().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});

async function testDisplayReloadKeepsReport(dataset) {
  await context.subject.loadDataset(dataset);
  const report = { config: { dataset: { path: dataset.dataset_path } },
    tables: { decision_actions: [{ fill_ts: "2026-07-20T11:30:00" }] },
    series: { equity: [{ ts: "2026-07-20T11:35:00", equity_cash: 123 }] },
    metrics: { trade_count: 4 } };
  context.WorkbenchCore.state.lastReport = report;
  context.WorkbenchDataHelpers = { timeframeMinutes: value => Number(value.replace("m", "")) };
  context.WorkbenchCharts = { renderMetrics: (...args) => calls.push(["renderMetrics", ...args]) };
  context.subject.renderReport(report);
  calls.length = 0;
  await context.subject.reloadDataset();
  assert.equal(context.WorkbenchCore.state.lastReport, report,
    "display-only reload must preserve the selected report and its frozen parameters");
  assert.ok(calls.some(([name, rows]) => name === "setDecisions" && rows === report.tables.decision_actions));
  assert.ok(calls.some(([name, rows]) => name === "setEquity" && rows === report.series.equity));
  assert.ok(calls.some(([name, _node, metrics]) => name === "renderMetrics" && metrics === report.metrics));
  elements.chartTimeframeSelect.value = "1m";
  assert.equal(context.subject.canReloadDataset(), false, "a coarser source cannot synthesize finer candles");
  elements.chartTimeframeSelect.value = "5m";
  context.subject.prepareInstrument("Another instrument");
  assert.equal(context.WorkbenchCore.state.lastReport, null, "a different market must invalidate its report context");
}

async function testHistoricalBatches(dataset) {
  calls.length = 0;
  const requests = [];
  context.WorkbenchApi.get = async url => {
    const query = new URLSearchParams(url.split("?")[1]);
    requests.push(query);
    const offset = Number(query.get("offset"));
    elements.dataTillDate.value = "2026-07-25";
    return { rows: Array.from({ length: 1000 }, (_, index) => ({ ts: offset + index })),
      preview_row_count: 3000, next_offset: offset + 1000, done: offset === 2000 };
  };
  await context.subject.loadDataset({ ...dataset, row_count: 3000 });
  assert.equal(requests.length, 3);
  assert.ok(requests.every(query => query.get("till_ts") === "2026-07-22T23:59:59"),
    "background date changes must not mix different preview windows");
  const submitted = calls.filter(([name]) => name === "setCandles");
  assert.ok(submitted.length <= 2, "historical loading must batch chart updates");
  assert.equal(submitted.at(-1)[1].length, 3000);
  assert.equal(submitted.at(-1)[1].at(-1).ts, 2999);
  assert.equal(calls.some(([name]) => name === "appendCandles"), false);
  context.WorkbenchApi.get = async () => { throw new Error("dataset fixture unavailable"); };
  await assert.rejects(context.subject.loadDataset(dataset), /dataset fixture unavailable/);
}

async function testDatasetBuildPreviewIsolation() {
  const requests = [];
  const previews = [];
  const buildContext = vm.createContext({
    console,
    WorkbenchStreamUI: {
      beginDatasetBuild() {},
      appendDatasetBuildPreview: async (rows) => previews.push(...rows),
    },
    WorkbenchApi: {
      get: (url) => new Promise((resolve) => requests.push({ url, resolve })),
    },
  });
  const buildSource = fs.readFileSync(
    path.join(__dirname, "web", "workbench_dataset_build_stream.js"), "utf8",
  );
  vm.runInContext(`${buildSource}\nglobalThis.subject = WorkbenchDatasetBuildStream;`, buildContext);
  const stream = buildContext.subject;
  stream.start("old", "Old build");
  const oldFinish = stream.finish("old");
  stream.stop();
  stream.start("new", "New build");
  requests[0].resolve({ rows: [{ ts: "old" }], next_sequence: 3, latest_sequence: 10 });
  await oldFinish;
  assert.equal(previews.length, 0, "an old build response must not append to a new build");
  assert.equal(requests.length, 1, "an old polling loop must stop after the build changes");

  const newUpdate = stream.update({ run_id: "new" });
  assert.match(requests[1].url, /\/new\/preview\?after=0$/);
  requests[1].resolve({ rows: [{ ts: "new" }], next_sequence: 1, latest_sequence: 1 });
  await newUpdate;
  assert.deepEqual(previews, [{ ts: "new" }]);

  const stoppedUpdate = stream.update({ run_id: "new" });
  stream.stop();
  requests[2].resolve({ rows: [{ ts: "stopped" }], next_sequence: 2, latest_sequence: 20 });
  await stoppedUpdate;
  assert.equal(requests.length, 3);
  assert.deepEqual(previews, [{ ts: "new" }], "a stopped build must ignore its pending response");
}
