const WorkbenchHistoryRange = (() => {
  const { $, state } = WorkbenchCore;
  let options = null;
  const records = new Map();
  const ttlMs = 60 * 1000;

  function init(configuration) { options = configuration; }

  function selection(timeframe = options?.sourceTimeframe()) {
    if (!options || !state.adapter?.capabilities?.supports_history_range) return null;
    const market = WorkbenchDataHelpers.marketSelection($);
    if (!market.symbol) return null;
    return { ...market, timeframe,
      key: JSON.stringify([market.adapterId, market.engine, market.symbol, timeframe]) };
  }

  function current(timeframe) {
    const selected = selection(timeframe);
    return selected ? records.get(selected.key) || null : null;
  }

  function ready(timeframe) {
    return !selection(timeframe) || current(timeframe)?.status === "ready";
  }

  async function refresh(timeframe) {
    const selected = selection(timeframe);
    if (!selected) { options?.onUpdate(); return true; }
    let record = records.get(selected.key);
    if (record?.status === "ready" && Date.now() - record.checkedAt < ttlMs) {
      options.onUpdate();
      return true;
    }
    if (record?.status !== "loading") {
      record = { status: "loading" };
      records.set(selected.key, record);
      record.promise = fetchRange(selected, record);
    }
    options.onUpdate();
    await record.promise;
    return selection(timeframe)?.key === selected.key && record.status === "ready";
  }

  async function fetchRange(selected, record) {
    try {
      const query = new URLSearchParams({ engine: selected.engine, symbol: selected.symbol,
        timeframe: selected.timeframe });
      const range = await WorkbenchApi.get(
        `/api/adapters/${encodeURIComponent(selected.adapterId)}/history-range?${query}`,
      );
      if (range.symbol !== selected.symbol || range.engine !== selected.engine
          || range.timeframe !== selected.timeframe || !range.from_date || !range.till_date
          || range.from_date > range.till_date) throw new Error("Invalid history range response");
      Object.assign(record, { status: "ready", range, checkedAt: Date.now() });
    } catch (error) {
      Object.assign(record, { status: "error", error: error.message });
    }
    if (selection()?.key === selected.key) options.onUpdate();
  }

  async function ensure(timeframe) {
    if (!selection(timeframe)) return null;
    if (!await refresh(timeframe)) throw new Error(current(timeframe)?.error || "Instrument selection changed");
    return current(timeframe).range;
  }

  return { init, current, ready, refresh, ensure };
})();
