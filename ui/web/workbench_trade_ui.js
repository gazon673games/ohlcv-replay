const WorkbenchTradeUI = (() => {
  const { $, escapeHtml, state } = WorkbenchCore;
  let report = null;
  let selected = null;

  function init() {
    $("tradeSearch").addEventListener("input", render);
    $("tradeDirection").addEventListener("change", render);
    $("tradeSort").addEventListener("change", render);
    $("tradesTable").addEventListener("click", event => {
      const row = event.target.closest("tr[data-trade-index]");
      if (row) select(Number(row.dataset.tradeIndex));
    });
    window.addEventListener("workbench-preferences-change", render);
    WorkbenchMarketChart.onMarkerClick((id, decisions) => {
      if (!report || state.lastReport !== report) return;
      const matches = WorkbenchTradeLink.forMarker(id, decisions, report.tables?.trades || []);
      WorkbenchCore.showView("tradesView");
      if (matches.length !== 1) {
        $("tradeSelectionNote").textContent = WorkbenchUX.t(matches.length ? "markerAmbiguous" : "markerUnavailable");
        return;
      }
      $("tradeSearch").value = "";
      $("tradeDirection").value = "";
      render();
      select(matches[0]);
      $("tradesTable").querySelector(`tr[data-trade-index="${matches[0]}"]`)?.scrollIntoView({ block: "nearest" });
    });
    window.addEventListener("workbench-report-cleared", clear);
    window.addEventListener("workbench-display-reloaded", () => {
      if (selected === null) return;
      const range = WorkbenchMarketChart.getVisibleRange();
      select(selected);
      if (range) WorkbenchMarketChart.setVisibleRange(range);
    });
  }

  function setReport(value) {
    report = value;
    selected = null;
    $("tradeSelectionNote").textContent = "";
    render();
  }

  function render() {
    const raw = report?.tables?.trades || [];
    const formatted = WorkbenchDecisionReport.tradeRows(raw, report?.config || {});
    const search = $("tradeSearch").value.trim().toLocaleLowerCase();
    const direction = $("tradeDirection").value;
    const filtered = raw.map((trade, index) => ({ trade, index, row: formatted[index] }))
      .filter(item => (!direction || (item.trade.direction || item.trade.side) === direction)
        && (!search || Object.values(item.row).join(" ").toLocaleLowerCase().includes(search)));
    filtered.sort((a, b) => {
      const order = (WorkbenchTime.marketTimestampSeconds(a.trade.entry_ts) || 0)
        - (WorkbenchTime.marketTimestampSeconds(b.trade.entry_ts) || 0);
      return $("tradeSort").value === "oldest" ? order : -order;
    });
    const columns = WorkbenchDecisionReport.tradeColumns();
    const head = `<tr>${columns.map(column => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>`;
    const rows = filtered.map(item => {
      const cells = columns.map(column => {
        const value = escapeHtml(item.row[column.key]);
        return `<td>${column.key === "trade"
          ? `<button class="trade-jump" title="${escapeHtml(WorkbenchUX.t("showOnChart"))}">${value}</button>` : value}</td>`;
      }).join("");
      return `<tr data-trade-index="${item.index}" class="${item.index === selected ? "trade-selected" : ""}" aria-selected="${item.index === selected}">${cells}</tr>`;
    }).join("");
    $("tradesTable").innerHTML = head + rows;
    $("tradeCount").textContent = `${WorkbenchUX.t("tradeCount")}: ${filtered.length} / ${raw.length}`;
  }

  function select(index) {
    const trade = report?.tables?.trades?.[index];
    if (!trade || state.lastReport !== report) return;
    const timing = report.config?.execution?.timing;
    if (!WorkbenchMarketChart.focusTrade(trade, timing, index)) {
      $("tradeSelectionNote").textContent = WorkbenchUX.t("tradeUnavailable");
      return;
    }
    selected = index;
    $("tradeSelectionNote").textContent = `${WorkbenchUX.t("tradeSelected")} #${trade.trade_id ?? index + 1}`;
    $("tradesTable").querySelectorAll("tr[data-trade-index]").forEach(row => {
      const active = Number(row.dataset.tradeIndex) === index;
      row.classList.toggle("trade-selected", active);
      row.setAttribute("aria-selected", String(active));
    });
  }

  function clear() {
    report = null;
    selected = null;
    $("tradeSelectionNote").textContent = "";
    $("reportContext").textContent = WorkbenchUX.t("noReport");
    $("reportParams").textContent = "";
    $("decisionsTable").innerHTML = "";
    render();
  }
  return { init, setReport };
})();
