const WorkbenchFormat = (() => {
  function renderMetrics(container, metrics) {
    const preferred = [
      "total_return", "net_pnl", "final_equity_cash", "max_drawdown", "sharpe",
      "min_equity_cash", "insolvent",
      "trade_count", "order_count", "run_count", "acceptance_status", "warning_count",
      "negative_oos_share",
    ];
    const keys = preferred.filter((key) => metrics[key] !== undefined && metrics[key] !== null);
    container.innerHTML = keys.map((key) => {
      const danger = (key === "insolvent" && metrics[key] === true)
        || (key === "min_equity_cash" && Number(metrics[key]) <= 0)
        || (key === "max_drawdown" && Number(metrics[key]) <= -1);
      return `<div class="metric${danger ? " metric-danger" : ""}"><span>${escapeHtml(key)}</span><strong>${escapeHtml(formatValue(metrics[key]))}</strong></div>`;
    }).join("");
  }

  function renderQuality(container, quality) {
    const outer = quality || {};
    const source = outer.source && typeof outer.source === "object" ? outer.source : outer;
    const gap = source.gap_audit || {};
    const repair = source.gap_repair || {};
    const roll = source.roll_audit || {};
    const dataset = source.dataset || {};
    container.textContent = [
      `quality: ${outer.approval_status || outer.status || source.approval_status || "unknown"}`,
      `symbol: ${dataset.continuous_symbol || source.continuous_symbol || "n/a"}`,
      `timeframe: ${dataset.timeframe || source.timeframe || "n/a"}`,
      `gaps: ${gap.gap_count ?? "n/a"} expected closures=${gap.expected_closure_count ?? "n/a"}`,
      `repair: ${repair.status || "n/a"}`,
      `rolls: ${roll.roll_count ?? "n/a"} contracts=${roll.contract_count ?? "n/a"}`,
      ...[...new Set([...(outer.warnings || []), ...(source.warnings || []),
        ...(source.market_metadata?.instrument_registry_audit?.warnings || []),
        ...(source.market_metadata?.calendar_audit?.warnings || []),
      ])].map((item) => `warning: ${item}`),
      ...(outer.violations || []).map((item) => `violation: ${item}`),
    ].join("\n");
  }

  function renderTable(table, rows, columns) {
    const safeColumns = (columns || []).map((column) => typeof column === "string"
      ? { key: column, label: column }
      : column);
    const head = `<tr>${safeColumns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>`;
    const body = (rows || []).map((row) => {
      return `<tr>${safeColumns.map((column) => `<td>${escapeHtml(formatValue(row[column.key]))}</td>`).join("")}</tr>`;
    }).join("");
    table.innerHTML = head + body;
  }

  function formatValue(value) {
    if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toPrecision(6);
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[char]);
  }

  return { escapeHtml, formatValue, renderMetrics, renderQuality, renderTable };
})();
