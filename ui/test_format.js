const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const context = vm.createContext({ console });
const source = fs.readFileSync(path.join(__dirname, "web", "workbench_format.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "web", "index.html"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "web", "style.css"), "utf8");
vm.runInContext(`${source}\nglobalThis.subject = WorkbenchFormat;`, context);

const table = { innerHTML: "" };
const rows = Array.from({ length: 284 }, (_, index) => ({ value: `decision-${index + 1}` }));
context.subject.renderTable(table, rows, ["value"]);

assert.match(table.innerHTML, /decision-284/u, "the complete decision log must be rendered");
assert.equal((table.innerHTML.match(/<tr>/gu) || []).length, 285, "all rows plus header are present");
assert.equal((html.match(/class="report-table-scroll"/gu) || []).length, 2);
assert.match(css, /\.report-table-scroll\s*\{[^}]*max-height:[^}]*overflow:\s*auto;/u);

const metrics = { innerHTML: "" };
context.subject.renderMetrics(metrics, {
  total_return: 2,
  min_equity_cash: -10,
  insolvent: true,
  sharpe: null,
});
assert.match(metrics.innerHTML, /min_equity_cash/u);
assert.match(metrics.innerHTML, /insolvent/u);
assert.equal((metrics.innerHTML.match(/metric-danger/gu) || []).length, 2);
assert.doesNotMatch(metrics.innerHTML, /sharpe/u);

process.stdout.write("table completeness tests passed\n");

const quality = { textContent: "" };
context.subject.renderQuality(quality, { approval_status: "warning", market_metadata: {
  instrument_registry_audit: { warnings: ["Research margin estimate"] },
  calendar_audit: { warnings: ["Independent calendar required"] },
} });
assert.match(quality.textContent, /warning: Research margin estimate/u);
assert.match(quality.textContent, /warning: Independent calendar required/u);
