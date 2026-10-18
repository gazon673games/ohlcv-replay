const WorkbenchPortfolioModel = (() => {
  function fresh() {
    return { name: "Портфель", diagnostic: false, sources: {}, config: {
      legs: [], strategy: { sdk_sleeves: [], strict_runtime: true, capital_policy: "monthly_rebalance" },
      portfolio: { initial_capital: 700, base_currency: "USDT", leverage: 1, risk_policy: "clip" },
      execution: { from_date: "2025-01-01", till_date: null, engine: "v3",
        timing: "signal_close_to_next_bar_open_to_close", end_of_data_position_policy: "mark",
        volume_participation_limit: 0.1, partial_fill_policy: "reject" },
      output: { root: "data/workbench/runs", run_id: "" },
    } };
  }
  function datasetLeg(item, diagnostic) {
    if (!item?.dataset_id) throw new Error("Выберите датасет / Select a dataset");
    return { asset_id: item.continuous_symbol || item.dataset_id, dataset_id: item.dataset_id,
      dataset_path: item.dataset_path, catalog_path: item.catalog_path,
      catalog_enforcement: diagnostic ? "audit" : "strict",
      quality_approval_required: !diagnostic,
      quality_approval_path: diagnostic ? null : item.quality_approval_path,
      instrument_registry_path: item.instrument_registry_path, calendar_path: item.calendar_path };
  }
  function validate(request) {
    const { config } = request;
    if (!config.legs.length) throw new Error("Добавьте инструменты / Add instruments");
    const ids = config.legs.map(leg => leg.asset_id);
    if (new Set(ids).size !== ids.length) throw new Error("Инструменты должны быть уникальны / Duplicate instruments");
    const capital = Number(config.portfolio.initial_capital);
    const budgets = config.strategy.sdk_sleeves.map(sleeve => Number(sleeve.initial_capital));
    if (!Number.isFinite(capital) || capital <= 0 || budgets.some(value => !Number.isFinite(value) || value <= 0)) {
      throw new Error("Капитал и бюджеты должны быть положительными / Positive capital and budgets required");
    }
    if (budgets.reduce((a, b) => a + b, 0) > capital) throw new Error("Бюджеты превышают капитал / Budgets exceed capital");
    if (config.execution.till_date && config.execution.till_date < config.execution.from_date) {
      throw new Error("Конец периода раньше начала / Invalid date range");
    }
    return request;
  }
  return { fresh, datasetLeg, validate };
})();
