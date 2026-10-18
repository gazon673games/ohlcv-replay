const WorkbenchPortfolioReport = (() => {
  const { words } = WorkbenchWindows;
  function render(report) {
    WorkbenchCore.state.lastReport = report;
    let win = WorkbenchWindows.get("portfolioReport");
    if (!win) {
      const content = document.createElement("div"); content.className = "portfolio-report";
      content.innerHTML = '<p data-context></p><div data-metrics></div><canvas data-equity></canvas><canvas data-drawdown></canvas><canvas data-pnl></canvas><div data-fills></div>';
      win = WorkbenchWindows.create({ id: "portfolioReport", title: words("Результат портфеля", "Portfolio result"), content,
        open: true, rect: { x: 60, y: 20, width: 860, height: 660 } });
    }
    const body = win.body;
    const diagnostic = report.manifest?.request?.diagnostic ?? report.config.legs.some(leg => !leg.quality_approval_required);
    const mode = diagnostic ? words("диагностический", "diagnostic") : words("строгий", "strict");
    body.querySelector("[data-context]").textContent = `${report.run_id} · ${mode} · ${report.config.portfolio.base_currency}`;
    const metrics = body.querySelector("[data-metrics]"); metrics.replaceChildren();
    const number = new Intl.NumberFormat(document.documentElement.lang, { maximumFractionDigits: 2 });
    const currency = report.config.portfolio.base_currency;
    const cards = [
      [words("Начальный капитал", "Initial capital"), `${number.format(report.config.portfolio.initial_capital)} ${currency}`],
      [words("Итоговый капитал", "Final equity"), `${number.format(report.metrics.final_equity_cash)} ${currency}`],
      [words("Прибыль", "Profit"), `${number.format(report.metrics.net_pnl)} ${currency}`],
      [words("Доходность", "Return"), `${number.format(report.metrics.total_return * 100)}%`],
      [words("Максимальная просадка", "Maximum drawdown"), `${number.format(Math.abs(report.metrics.max_drawdown) * 100)}%`],
      [words("Исполненных операций", "Confirmed fills"), report.assets.reduce((sum, asset) => sum + asset.fill_count, 0)],
    ];
    cards.forEach(([label, value]) => {
      const card = document.createElement("div"); card.className = "portfolio-metric";
      const caption = document.createElement("span"); caption.textContent = label;
      const content = document.createElement("strong"); content.textContent = value; card.append(caption, content); metrics.append(card);
    });
    const options = WorkbenchCore.chartOptions();
    WorkbenchCharts.drawLine(body.querySelector("[data-equity]"), report.series.equity, "equity_cash", "--chart-1", options);
    WorkbenchCharts.drawDrawdown(body.querySelector("[data-drawdown]"), report.series.equity, options);
    WorkbenchCharts.drawMultiLine(body.querySelector("[data-pnl]"), report.assets.map(asset => ({
      name: asset.asset_id, rows: asset.pnl, column: "net_pnl",
    })), options);
    const tables = body.querySelector("[data-fills]"); tables.replaceChildren();
    const currentCharts = new Set(report.assets.map(asset => `portfolio-chart-${asset.asset_id}`));
    WorkbenchMultiChart.stats().filter(chart => chart.id.startsWith("portfolio-chart-") && !currentCharts.has(chart.id))
      .forEach(chart => WorkbenchWindows.remove(chart.id));
    report.assets.forEach(asset => {
      WorkbenchMultiChart.open(asset, `portfolio-chart-${asset.asset_id}`);
      const title = document.createElement("h4");
      title.textContent = `${asset.asset_id} · ${words("исполненных операций", "confirmed fills")}: ${asset.fill_count}`;
      const table = document.createElement("div"); table.className = "fill-table";
      WorkbenchCharts.renderTable(table, asset.fills, ["fill_ts", "filled_contract_delta", "fill_price", "order_status", "strategy_reason"]);
      tables.append(title, table);
      if (asset.fills.length < asset.fill_count) {
        const note = document.createElement("p"); note.textContent = words("Показаны последние 2000 операций. Полный список — в артефактах запуска.", "Last 2000 fills shown; full history is in run artifacts.");
        tables.append(note);
      }
    });
    WorkbenchWindows.show("portfolioReport");
    WorkbenchCore.setStatus(`${words("Портфель завершён", "Portfolio completed")}: ${report.run_id}`, "completed");
  }
  return { render };
})();
