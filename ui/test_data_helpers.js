const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("web/workbench_data_helpers.js", "utf8");
const context = {};
vm.createContext(context);
vm.runInContext(`${source}\nthis.helpers = WorkbenchDataHelpers;`, context);

const common = {
  continuous_symbol: "CR",
  timeframe: "5m",
  start_ts: "2026-01-01T07:00:00Z",
  end_ts: "2026-07-22T16:00:00Z",
  metadata: {
    requested_from_date: "2026-01-01",
    requested_till_date: "2026-07-22",
    bar_time_semantics: "open_with_available_at",
  },
};
const rejectedFresh = {
  ...common,
  dataset_id: "rejected-fresh",
  quality_status: "rejected",
  metadata: { ...common.metadata, built_at: new Date().toISOString() },
};
const approvedStale = {
  ...common,
  dataset_id: "approved-stale",
  quality_status: "approved",
  metadata: { ...common.metadata, built_at: "2000-01-01T00:00:00Z" },
};
const selection = {
  symbol: "CR",
  sourceTimeframe: "5m",
  from: "2026-01-01",
  till: "2026-07-22",
  requireCoverage: true,
  requireFinalBars: true,
  requireApproval: true,
  maxAgeMinutes: 5,
};

assert.strictEqual(context.helpers.matchesDataset(approvedStale, selection), false);
assert.equal(context.helpers.matchesDataset({ ...common, metadata: { ...common.metadata,
  instrument_mode: "nearest_futures", roll_rule: "volume" } }, {
  symbol: "CR", instrumentMode: "nearest_futures", rollRule: "expiry",
}), false, "automatic cache selection must respect the roll rule");
assert.equal(context.helpers.matchesDataset({ ...common, metadata: { ...common.metadata,
  instrument_mode: "security" } }, { symbol: "CR", instrumentMode: "nearest_futures" }), false);
assert.strictEqual(
  context.helpers.bestMatchingDataset([rejectedFresh, approvedStale], selection),
  null,
);
assert.strictEqual(context.helpers.qualityAllows(rejectedFresh, true), false);
assert.strictEqual(context.helpers.qualityAllows(rejectedFresh, false), false);
assert.strictEqual(context.helpers.qualityAllows({ quality_status: "warning" }, false), true);

const limits = context.helpers.dateRangeLimits(
  [{ ...rejectedFresh, metadata: {
    ...rejectedFresh.metadata, requested_from_date: "2025-01-01",
  } }],
  { symbol: "CR", sourceTimeframe: "5m" },
  new Date(2026, 6, 22),
);
assert.deepStrictEqual({ ...limits }, { min: "2026-01-01", max: "2026-07-22" });
assert.deepStrictEqual(
  { ...context.helpers.normalizeDateRange({
    from: "1900-01-01", till: "2100-01-01", ...limits,
  }) },
  { from: "2026-01-01", till: "2026-07-22", changed: true },
);
assert.deepStrictEqual(
  { ...context.helpers.normalizeDateRange({
    from: "2026-07-20", till: "2026-07-10", ...limits,
  }, "dataTillDate") },
  { from: "2026-07-10", till: "2026-07-10", changed: true },
);
const fields = {
  adapterSelect: "binance", engineSelect: "perpetual", marketSelect: "crypto",
  boardSelect: "USD_M_PERPETUAL", instrumentSelect: "BTCUSDT", instrumentMode: "security",
  dataFromDate: "2026-06-01", dataTillDate: "2026-09-01", chartTimeframeSelect: "5m",
  cachePolicy: "network", rollRule: "expiry",
};
const request = context.helpers.buildRequest(
  (id) => ({ value: fields[id] }),
  "5m",
  0,
);
assert.equal(request.engine, "perpetual");
assert.equal(request.security, "BTCUSDT");
assert.equal(request.source_delay_minutes, 0);
assert.equal(request.archive_fallback_policy, "missing_only");
fields.archiveFallbackPolicy = "invalid_timestamps_and_missing_marks";
assert.equal(context.helpers.buildRequest((id) => ({ value: fields[id] }), "5m").archive_fallback_policy,
  "invalid_timestamps_and_missing_marks");
fields.rollRule = "";
assert.equal(context.helpers.buildRequest((id) => ({ value: fields[id] }), "5m").roll_rule, null);
const spotDataset = { ...common, engine: "spot", metadata: {
  ...common.metadata, adapter_id: "binance",
} };
assert.equal(context.helpers.matchesDataset(spotDataset, {
  symbol: "CR", engine: "perpetual", adapterId: "binance",
}), false);
assert.equal(context.helpers.matchesDataset(spotDataset, {
  symbol: "CR", engine: "spot", adapterId: "binance",
}), true);
const datedSpot = { ...spotDataset, start_ts: "2020-08-11", metadata: {
  ...spotDataset.metadata, requested_from_date: "2019-01-01",
} };
const datedPerpetual = { ...datedSpot, engine: "perpetual", start_ts: "2020-09-14" };
assert.equal(context.helpers.dateRangeLimits([datedSpot, datedPerpetual], {
  symbol: "CR", engine: "perpetual", adapterId: "binance",
}).min, "2020-09-14");
const finalBarSelection = { ...selection, requireApproval: false,
  latestBar: "2026-07-22T16:00:00Z" };
assert.equal(context.helpers.matchesDataset(approvedStale, finalBarSelection), true);
assert.equal(context.helpers.bestMatchingDataset([rejectedFresh, approvedStale], finalBarSelection),
  approvedStale);
assert.equal(context.helpers.matchesDataset(approvedStale, {
  ...finalBarSelection, latestBar: "2026-07-22T16:05:00Z",
}), false);
assert.equal(context.helpers.matchesDataset({ ...approvedStale, end_ts: "invalid" }, finalBarSelection), false);
const getField = (id) => ({ value: id === "cachePolicy" ? "prefer" : "2026-07-22" });
const range = { status: "ready", range: { last_bar: "2026-07-22T16:00:00Z" } };
assert.deepStrictEqual({ ...context.helpers.datasetFreshness(getField, {}, range) }, {
  latestBar: "2026-07-22T16:00:00Z",
});
assert.deepStrictEqual({ ...context.helpers.datasetFreshness(
  (id) => ({ value: id === "cachePolicy" ? "only" : "2026-07-22" }), {}, range,
) }, {});
const afterMidnight = new Date("2026-07-23T00:05:00Z");
const completedDay = context.helpers.datasetFreshness(getField, {}, null, afterMidnight);
assert.equal(completedDay.minSourceAsOf, "2026-07-22T23:59:59.999Z");
const partial = { ...approvedStale, metadata: { ...approvedStale.metadata,
  source_as_of: "2026-07-22T20:00:00Z" } };
assert.equal(context.helpers.matchesDataset(partial, { ...selection, maxAgeMinutes: null,
  ...completedDay }), false, "yesterday's partial snapshot must not claim a completed day");
assert.equal(context.helpers.matchesDataset({ ...partial, metadata: { ...partial.metadata,
  source_as_of: "2026-07-23T00:01:00Z" } }, { ...selection, maxAgeMinutes: null,
  ...completedDay }), true);
const utcStillToday = context.helpers.datasetFreshness(getField, {}, null,
  new Date("2026-07-23T00:05:00+03:00"));
assert.equal(utcStillToday.maxAgeMinutes, 5, "freshness must follow the UTC data day");
const chartSelection = { ...selection, sourceTimeframe: undefined, chartTimeframe: "60m",
  maxAgeMinutes: undefined, requireFinalBars: false };
assert.equal(context.helpers.bestChartDataset([rejectedFresh], chartSelection), rejectedFresh);
assert.equal(context.helpers.bestMatchingDataset([rejectedFresh], selection), null);
assert.equal(context.helpers.matchesDataset({ ...common, timeframe: "120m" }, chartSelection), false);
assert.equal(context.helpers.matchesDataset({ ...common, timeframe: null }, chartSelection), false);
const newest = { ...rejectedFresh, end_ts: "2026-07-22T17:00:00Z" };
assert.equal(context.helpers.bestChartDataset([rejectedFresh, newest], chartSelection), newest);
const early = { ...common, start_ts: "2020-01-01T00:00:00Z", end_ts: "2025-12-31T23:00:00Z",
  metadata: { ...common.metadata, requested_from_date: "2020-01-01" } };
assert.deepStrictEqual({ ...context.helpers.savedHistoryRange([early, newest], { symbol: "CR" }) },
  { min: "2020-01-01", max: "2026-07-22" });
assert.equal(context.helpers.matchesDataset({ ...newest, end_ts: "2026-07-21T23:00:00Z" }, chartSelection), false,
  "a requested download end must not claim that the next day was saved");
console.log("data helper tests passed");

const legacyFields = id => id === "requireQualityGate" ? { checked: false }
  : { value: id === "rulesEnforcement" ? "strict" : fields[id] };
assert.equal(context.helpers.buildRequest(legacyFields, "5m").rules_enforcement, "audit");
const approvedFields = id => id === "requireQualityGate" ? { checked: true } : legacyFields(id);
assert.equal(context.helpers.buildRequest(approvedFields, "5m").rules_enforcement, "strict");
