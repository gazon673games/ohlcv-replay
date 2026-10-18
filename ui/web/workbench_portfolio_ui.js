const WorkbenchPortfolioUI = (() => {
  const { words } = WorkbenchWindows;
  const { escapeHtml: esc } = WorkbenchFormat;
  let panel, form, list, errorBox, runButton, presets = [], datasets = [], strategies = [], request;

  function field(name, label, value, type = "text") {
    return `<label>${esc(label)}<input data-field="${name}" type="${type}" value="${esc(value ?? "")}" /></label>`;
  }
  function select(name, label, options, value) {
    return `<label>${esc(label)}<select data-field="${name}">${options.map(([id, title]) =>
      `<option value="${esc(id)}" ${id === value ? "selected" : ""}>${esc(title)}</option>`).join("")}</select></label>`;
  }
  async function init() {
    panel = document.createElement("div"); panel.className = "portfolio-panel"; panel.id = "portfolioPanel";
    panel.innerHTML = `<div class="portfolio-actions"><select id="portfolioPresets" aria-label="Portfolio preset"></select>
      <button data-action="load">${words("Открыть", "Open")}</button><button data-action="save">${words("Сохранить", "Save")}</button>
      <button data-action="import">${words("Импорт JSON", "Import JSON")}</button><button data-action="export">${words("Экспорт JSON", "Export JSON")}</button>
      <button data-action="new">${words("Новый", "New")}</button></div><div class="portfolio-form"></div>
      <p class="portfolio-error" role="alert"></p>`;
    form = panel.querySelector(".portfolio-form"); errorBox = panel.querySelector(".portfolio-error");
    WorkbenchWindows.create({ id: "portfolio", title: words("Портфель", "Portfolio"), content: panel,
      rect: { x: 100, y: 30, width: 850, height: 650 } });
    const actions = { load: loadPreset, save, import: importFile, export: exportFile,
      new: () => render(WorkbenchPortfolioModel.fresh()) };
    panel.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => guarded(actions[button.dataset.action])));
    render(WorkbenchPortfolioModel.fresh());
    await refresh();
    if (presets.length) loadPreset();
  }
  async function guarded(action) {
    try { errorBox.textContent = ""; await action(); }
    catch (error) { errorBox.textContent = error.message; }
  }
  async function refresh() {
    const responses = await Promise.all([WorkbenchApi.get("/api/portfolios"), WorkbenchApi.get("/api/datasets"), WorkbenchApi.get("/api/strategies")]);
    presets = responses[0].items || []; datasets = responses[1].items || [];
    strategies = (responses[2].items || []).filter(item => item.language === "python");
    WorkbenchCore.fillSelect(document.getElementById("portfolioPresets"), presets.map(item => ({ id: item.preset_id, name: item.name })), request?.preset_id);
  }
  function loadPreset() {
    const preset = presets.find(item => item.preset_id === document.getElementById("portfolioPresets").value);
    if (preset) render(preset);
  }
  function render(next) {
    request = structuredClone(next); const { portfolio: p, execution: e, strategy: s } = request.config;
    form.innerHTML = `${field("name", words("Название", "Name"), request.name)}<div class="portfolio-fields">
      ${field("initial_capital", words("Общий капитал", "Total capital"), p.initial_capital, "number")}
      ${field("base_currency", words("Валюта", "Currency"), p.base_currency)}
      ${field("leverage", words("Плечо маржинального счёта", "Account leverage"), p.leverage, "number")}
      ${field("from_date", words("Начало UTC", "From UTC"), e.from_date, "date")}
      ${field("till_date", words("Конец UTC, включительно", "Through UTC, inclusive"), e.till_date, "date")}
      ${select("capital_policy", words("Перераспределение бюджетов", "Budget redistribution"), [
        ["independent", words("Без перераспределения", "Independent")],
        ["monthly_profit", words("Прибыль раз в месяц", "Monthly profit")],
        ["monthly_rebalance", words("Восстановление весов раз в месяц", "Monthly rebalance")]], s.capital_policy)}
      </div><label class="check-inline"><input data-field="diagnostic" type="checkbox" ${request.diagnostic ? "checked" : ""} />
      ${words("Диагностический запуск с упрощёнными историческими данными", "Diagnostic run with simplified historical data")}</label>
      <p>${words("Бюджеты ниже — доли общего капитала для расчёта позиций. Остаток — резерв размеров позиций; при общей марже он входит в обеспечение. Плечо входа и доборы задаются параметрами каждой стратегии.",
        "Budgets below size each strategy. Unallocated capital is a sizing reserve and participates in cross collateral. Entry exposure and adds are strategy parameters.")}</p>
      <div class="portfolio-legs"></div><div class="portfolio-actions"><button data-add>${words("+ Инструмент", "+ Instrument")}</button>
      <button id="portfolioRunButton">${words("Запустить портфель", "Run portfolio")}</button></div>`;
    list = form.querySelector(".portfolio-legs");
    request.config.legs.forEach(leg => addRow(leg, s.sdk_sleeves.find(item => item.asset_id === leg.asset_id), request.sources?.[leg.asset_id]));
    form.querySelector("[data-add]").addEventListener("click", () => guarded(async () => { await refresh(); addRow(); }));
    runButton = form.querySelector("#portfolioRunButton"); runButton.addEventListener("click", () => guarded(run));
  }
  function addRow(leg = null, sleeve = null, source = null) {
    const row = document.createElement("section"); row.className = "portfolio-leg";
    row.leg = leg; row.sleeve = sleeve; row.source = source; row.sourceRevision = 0;
    const items = datasets.map(item => [item.dataset_id, `${item.continuous_symbol || item.dataset_id} · ${item.timeframe || ""} · ${item.quality_status || ""}`]);
    const existing = leg?.dataset_id || "existing";
    if (leg && !items.some(([id]) => id === existing)) items.unshift([existing, `${leg.asset_id} · ${leg.dataset_path}`]);
    row.innerHTML = `<div class="portfolio-fields">${select("dataset", words("Датасет", "Dataset"), items, existing)}
      ${field("budget", words("Бюджет", "Budget"), sleeve?.initial_capital ?? 100, "number")}
      ${field("max_exposure", words("Максимальная экспозиция, × бюджета", "Maximum exposure, × budget"), sleeve?.max_exposure ?? 1, "number")}</div>
      ${select("strategy", words("SDK-стратегия", "SDK strategy"), [["existing", sleeve ? String(sleeve.strategy_file) : words("Выберите стратегию", "Choose strategy")],
        ...strategies.map(item => [item.id, item.name])], "existing")}
      <div class="portfolio-actions"><button data-editor>${words("Взять из редактора", "Use editor draft")}</button>
      <button data-chart>${words("Открыть график", "Open chart")}</button><button data-remove>${words("Удалить", "Remove")}</button></div>
      <label>${words("Параметры стратегии (JSON)", "Strategy parameters (JSON)")}<textarea data-params spellcheck="false"></textarea></label>`;
    row.querySelector("[data-params]").value = JSON.stringify(sleeve?.params || {}, null, 2);
    row.querySelector('[data-field="strategy"]').addEventListener("change", () => guarded(async () => {
      const id = row.querySelector('[data-field="strategy"]').value;
      const revision = ++row.sourceRevision;
      if (id === "existing") { row.loading = false; return; }
      row.loading = true; row.source = null; row.sleeve = null;
      let record;
      try { record = await WorkbenchApi.get(`/api/strategies/${encodeURIComponent(id)}`); }
      finally { if (revision === row.sourceRevision) row.loading = false; }
      if (revision !== row.sourceRevision || !row.isConnected) return;
      row.source = record.source; row.sleeve = { strategy_file: `${id.replace("sdk:", "")}.py` };
      row.querySelector('[data-field="strategy"] option[value="existing"]').textContent = record.name;
      row.querySelector("[data-params]").value = JSON.stringify(record.params || {}, null, 2);
    }));
    row.querySelector("[data-editor]").addEventListener("click", () => guarded(() => {
      row.sourceRevision++; row.loading = false;
      if (WorkbenchEditor.getLanguage() !== "python") throw new Error("Portfolio requires Python SDK");
      row.source = WorkbenchStrategyUI.sourceForRun(); row.sleeve = { strategy_file: "editor-draft.py" };
      row.querySelector("[data-params]").value = JSON.stringify(WorkbenchStrategyUI.collectParams(), null, 2);
      row.querySelector('[data-field="strategy"]').value = "existing";
    }));
    row.querySelector("[data-remove]").addEventListener("click", () => row.remove());
    row.querySelector("[data-chart]").addEventListener("click", () => guarded(() => {
      const id = row.querySelector('[data-field="dataset"]').value;
      if (!datasets.some(item => item.dataset_id === id)) throw new Error(words(
        "Датасет вне локального каталога. Его график появится после запуска портфеля.",
        "Dataset is outside the local catalog. Its chart will appear after running the portfolio."));
      WorkbenchMultiChart.open(null, null, id);
    }));
    list.append(row);
  }
  async function collect() {
    const next = structuredClone(request), { config } = next;
    const value = key => form.querySelector(`[data-field="${key}"]`).value;
    next.name = value("name"); next.diagnostic = form.querySelector('[data-field="diagnostic"]').checked;
    Object.assign(config.portfolio, { initial_capital: Number(value("initial_capital")), base_currency: value("base_currency"), leverage: Number(value("leverage")) });
    Object.assign(config.execution, { from_date: value("from_date"), till_date: value("till_date") || null });
    config.strategy.capital_policy = value("capital_policy"); config.output.run_id = "";
    config.legs = []; config.strategy.sdk_sleeves = []; next.sources = {};
    for (const row of list.children) {
      if (row.loading) throw new Error(words("Стратегия ещё загружается", "Strategy is still loading"));
      const field = key => row.querySelector(`[data-field="${key}"]`).value;
      let leg = row.leg;
      if (!leg || (leg.dataset_id || "existing") !== field("dataset")) {
        leg = WorkbenchPortfolioModel.datasetLeg(await WorkbenchApi.get(`/api/datasets/${encodeURIComponent(field("dataset"))}`), next.diagnostic);
      }
      leg = { ...leg, quality_approval_required: !next.diagnostic,
        quality_approval_path: next.diagnostic ? null : leg.quality_approval_path,
        catalog_enforcement: next.diagnostic ? (leg.catalog_path ? "audit" : "off") : "strict" };
      if (!row.sleeve) throw new Error(`${leg.asset_id}: ${words("выберите SDK-стратегию", "select an SDK strategy")}`);
      const params = JSON.parse(row.querySelector("[data-params]").value);
      if (!params || typeof params !== "object" || Array.isArray(params)) throw new Error(`${leg.asset_id}: params must be a JSON object`);
      config.legs.push(leg); config.strategy.sdk_sleeves.push({ ...row.sleeve, asset_id: leg.asset_id,
        params, initial_capital: Number(field("budget")), max_exposure: Number(field("max_exposure")) });
      if (row.source) next.sources[leg.asset_id] = row.source;
    }
    return WorkbenchPortfolioModel.validate(next);
  }
  async function save() {
    request = await WorkbenchApi.post("/api/portfolios", await collect()); await refresh();
    errorBox.textContent = words("Сохранено", "Saved");
  }
  async function run() {
    const { state, $, setStatus } = WorkbenchCore;
    if (state.runBusy || state.currentJobId) throw new Error(words("Дождитесь текущего запуска", "Wait for the current run"));
    state.runBusy = true; runButton.disabled = true; $("runButton").disabled = true;
    try {
      const payload = await WorkbenchApi.post("/api/portfolio-runs/async", await collect());
      state.currentJobId = payload.run_id; $("cancelButton").disabled = false;
      await WorkbenchRunUI.pollJob(payload.run_id);
      const report = await WorkbenchApi.get(`/api/runs/${encodeURIComponent(payload.run_id)}/report`);
      WorkbenchRunUI.renderReport(report);
      await Promise.all([WorkbenchRunUI.loadHistory(payload.run_id), WorkbenchRunUI.loadJobs()]);
    } catch (error) {
      setStatus(error.message, error.code === "JOB_CANCELLED" ? "cancelled" : "failed"); throw error;
    } finally {
      state.runBusy = false; state.currentJobId = null; runButton.disabled = false;
      $("cancelButton").disabled = true; WorkbenchQualityUI.update(); WorkbenchMarketData.resume();
    }
  }
  function importFile() {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".json";
    input.addEventListener("change", () => guarded(async () => {
      if (!input.files[0]) return; const payload = JSON.parse(await input.files[0].text());
      const next = payload.config ? payload : { name: words("Импортированный портфель", "Imported portfolio"), config: payload,
        sources: {}, diagnostic: payload.legs.some(leg => !leg.quality_approval_required) };
      WorkbenchPortfolioModel.validate(next); render(next);
    })); input.click();
  }
  async function exportFile() {
    const payload = await collect(); const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "portfolio.json"; link.click(); URL.revokeObjectURL(url);
  }
  return { init, render, collect };
})();
