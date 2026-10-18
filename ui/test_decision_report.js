const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ console, document: { documentElement: { lang: "ru" } } });
const time = fs.readFileSync(path.join(__dirname, "web", "workbench_time.js"), "utf8");
const report = fs.readFileSync(path.join(__dirname, "web", "workbench_decision_report.js"), "utf8");
vm.runInContext(`${time}\n${report}\nglobalThis.subject = WorkbenchDecisionReport;`, context);

const [row] = context.subject.decisionRows([{
  ts: "2026-07-20T11:30:00",
  fill_ts: "2026-07-20T11:35:00",
  decision_time: "11:30",
  action: "open_short",
  reason: "short_signal",
  strategy_features: JSON.stringify({
    close: 11.741, sma: 11.749944, side: "short", sessionBars: 18,
    sessionFrom: "10:00", minBars: 16, maxBars: 20, priceAllows: true,
  }),
  previous_position: 0,
  previous_contracts: 0,
  target_position: -1,
  target_contracts: -1,
  filled_contract_delta: -1,
  fill_price: 11.73,
  order_status: "filled",
}]);

assert.equal(row.decision, "20.07.2026 11:30");
assert.match(row.action, /Открыт шорт/u);
assert.match(row.execution, /20\.07\.2026 11:35/u);
assert.match(row.rationale, /11,741 < SMA 11,749944/u);
assert.match(row.rationale, /16–20/u);
assert.equal(row.position, "без позиции → шорт 1");

const [skipped] = context.subject.decisionRows([{
  ts: "2022-12-06T14:40:00", action: "hold_long",
  reason: "insufficient_margin_add_skipped", order_status: "rejected_insufficient_margin",
  previous_position: 1, target_position: 1,
  previous_contracts: 136, target_contracts: 136, requested_contracts: 168,
  filled_contract_delta: 0, fill_fraction: 0,
}]);
assert.match(skipped.rationale, /Добор пропущен: недостаточно средств/u);
assert.equal(skipped.execution, "Добор не исполнен; текущая позиция сохранена");
assert.equal(skipped.position, "лонг 136 → лонг 136");

context.document.documentElement.lang = "en";
const [english] = context.subject.decisionRows([{
  action: "open_short", reason: "short_signal",
  strategy_features: { close: 11.741, sma: 11.749944, side: "short" },
}]);
assert.match(english.action, /Opened short/u);
assert.match(english.rationale, /11\.741 < SMA 11\.749944/u);

process.stdout.write("decision report tests passed\n");
