const WorkbenchDataHelpers = (() => {
  function instrumentLabel(item) {
    const name = item.display_name || item.name || item.short_name || item.symbol;
    return name.includes(item.symbol) ? name : `${name} - ${item.symbol}`;
  }

  function marketSelection(get) {
    return { adapterId: get("adapterSelect").value, engine: get("engineSelect").value,
      symbol: get("instrumentSelect").value, market: get("marketSelect")?.value,
      instrumentMode: get("instrumentMode")?.value, rollRule: get("rollRule")?.value };
  }

  function adapterBase(get) {
    const adapter = get("adapterSelect").value;
    if (!adapter) throw new Error("Select a market-data adapter");
    return `/api/adapters/${encodeURIComponent(adapter)}`;
  }

  function adapterQuery(get) {
    return new URLSearchParams({
      engine: get("engineSelect").value || "",
      market: get("marketSelect").value || "",
      board: get("boardSelect").value || "",
      query: get("instrumentSearch").value || "",
    }).toString();
  }

  function datasetLabel(item) {
    const status = item.quality_status || "unknown";
    return `${item.continuous_symbol || item.dataset_id} | ${item.timeframe || ""} | ${status}`;
  }

  function matchesDataset(item, selection) {
    if (selection.adapterId && item.metadata?.adapter_id
        && item.metadata.adapter_id !== selection.adapterId) return false;
    if (selection.engine && item.engine && item.engine !== selection.engine) return false;
    if (selection.market && item.market && item.market !== selection.market) return false;
    if (selection.instrumentMode && item.metadata?.instrument_mode
        && item.metadata.instrument_mode !== selection.instrumentMode) return false;
    if (selection.instrumentMode === "nearest_futures" && selection.rollRule
        && item.metadata?.roll_rule && item.metadata.roll_rule !== selection.rollRule) return false;
    const candidates = [
      item.continuous_symbol,
      item.metadata?.security,
      item.dataset_id,
    ].filter(Boolean).map(String);
    const symbolMatches = candidates.some((candidate) => candidate === selection.symbol
      || candidate.startsWith(`${selection.symbol}_`)
      || candidate.includes(`:${selection.symbol}:`));
    const timeframeMatches = !selection.sourceTimeframe
      || item.timeframe === selection.sourceTimeframe;
    if (!symbolMatches || !timeframeMatches) return false;
    if (selection.chartTimeframe) {
      if (!/^[1-9]\d*(m|h|d)$/.test(String(item.timeframe || ""))) return false;
      const source = timeframeMinutes(item.timeframe);
      if (timeframeMinutes(selection.chartTimeframe) % source !== 0) return false;
    }
    if (!selection.requireCoverage) return true;
    const requestedFrom = item.metadata?.requested_from_date || datePart(item.start_ts);
    const requestedTill = selection.chartTimeframe ? datePart(item.end_ts)
      : item.metadata?.requested_till_date || datePart(item.end_ts);
    if (requestedFrom > selection.from || requestedTill < selection.till) return false;
    if (selection.requireFinalBars
        && item.metadata?.bar_time_semantics !== "open_with_available_at") return false;
    if (selection.latestBar) {
      const latest = Date.parse(selection.latestBar);
      const last = Date.parse(item.end_ts);
      return Number.isFinite(latest) && Number.isFinite(last) && last >= latest;
    }
    if (selection.minSourceAsOf) {
      const retrieved = Date.parse(item.metadata?.source_as_of || item.metadata?.built_at || "");
      if (!Number.isFinite(retrieved) || retrieved < Date.parse(selection.minSourceAsOf)) return false;
    }
    if (!selection.maxAgeMinutes) return true;
    const builtAt = Date.parse(item.metadata?.source_as_of || item.metadata?.built_at || "");
    return Number.isFinite(builtAt)
      && Date.now() - builtAt <= selection.maxAgeMinutes * 60 * 1000;
  }

  function bestMatchingDataset(items, selection) {
    const matches = items.filter((item) => qualityAllows(item, selection.requireApproval)
      && matchesDataset(item, selection));
    return rankDatasets(matches, selection);
  }

  function bestChartDataset(items, selection) {
    // Displaying saved prices does not authorize their use in a backtest.
    return rankDatasets(items.filter((item) => matchesDataset(item, selection)), selection);
  }

  function rankDatasets(matches, selection) {
    return matches.sort((left, right) => {
      if (selection.requireCoverage) {
        const resolution = selection.chartTimeframe
          ? timeframeMinutes(right.timeframe) - timeframeMinutes(left.timeframe) : 0;
        const newest = String(right.end_ts).localeCompare(String(left.end_ts))
          || String(right.metadata?.built_at || "").localeCompare(String(left.metadata?.built_at || ""));
        return resolution || (selection.chartTimeframe ? newest : 0) || datasetSpan(left) - datasetSpan(right);
      }
      return datePart(left.start_ts).localeCompare(datePart(right.start_ts))
        || datePart(right.end_ts).localeCompare(datePart(left.end_ts));
    })[0] || null;
  }

  function savedHistoryRange(items, selection) {
    const ranges = items.filter(item => matchesDataset(item, { ...selection, requireCoverage: false }))
      .map(item => {
        const actual = datePart(item.start_ts);
        const from = item.metadata?.requested_from_date || actual;
        return { min: from > actual ? from : actual, max: datePart(item.end_ts) };
      }).filter(range => range.min && range.max);
    return ranges.length
      ? { min: ranges.map(range => range.min).sort()[0], max: ranges.map(range => range.max).sort().at(-1) }
      : null;
  }

  function datasetFreshness(get, capabilities, remote, now = new Date()) {
    if (["only", "offline"].includes(get("cachePolicy").value)) return {};
    const till = get("dataTillDate").value;
    const cutoff = Date.parse(`${till}T23:59:59.999Z`);
    // A file collected during a day cannot claim that the entire day is complete later.
    const completed = cutoff < now.getTime() ? { minSourceAsOf: new Date(cutoff).toISOString() } : {};
    if (remote?.status === "ready") {
      return till >= datePart(remote.range.last_bar)
        ? { latestBar: remote.range.last_bar } : completed;
    }
    return cutoff >= now.getTime()
      ? { maxAgeMinutes: capabilities.freshness_ttl_minutes || 5 } : completed;
  }

  function datasetSpan(item) {
    return new Date(item.end_ts).getTime() - new Date(item.start_ts).getTime();
  }

  function dateRangeLimits(items, selection, now = new Date()) {
    const matchingSelection = { ...selection, requireCoverage: false };
    const probes = items.filter((item) => matchesDataset(item, matchingSelection)).map((item) => {
      const actual = datePart(item.start_ts);
      const requested = item.metadata?.requested_from_date;
      return requested && actual && requested < actual ? actual : null;
    }).filter(Boolean);
    return { min: probes.sort()[0] || "", max: localDate(now) };
  }

  function normalizeDateRange({ from, till, min, max }, editedId = "") {
    const original = { from, till };
    from = clampDate(from, min, max);
    till = clampDate(till, min, max);
    if (from && till && from > till) {
      if (editedId === "dataFromDate") till = from;
      else from = till;
    }
    return { from, till, changed: from !== original.from || till !== original.till };
  }

  function clampDate(value, min, max) {
    if (!value) return value;
    if (min && value < min) return min;
    if (max && value > max) return max;
    return value;
  }

  function localDate(value) {
    const pad = (part) => String(part).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  function qualityAllows(item, requireApproval) {
    if (!item) return false;
    if (["rejected", "split_required"].includes(item.quality_status)) return false;
    return !requireApproval || item.quality_status === "approved";
  }

  function validateSelection({ symbol, from, till }) {
    if (!symbol) throw new Error("Choose a future or pair");
    if (!from || !till) throw new Error("Choose the start and end dates");
    if (from > till) throw new Error("The start date is later than the end date");
  }

  function defaultDateRange(now = new Date()) {
    const start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { from: start.toISOString().slice(0, 10), till: now.toISOString().slice(0, 10) };
  }

  function errorMessage(prefix, error) {
    const raw = String(error?.message || error || "unknown error");
    let detail = raw;
    if (raw.includes("CERTIFICATE_VERIFY_FAILED")) {
      detail = "The market-data TLS certificate could not be verified";
    } else if (raw.toLowerCase().includes("timed out")) {
      detail = "The data source did not respond in time; check the network and retry";
    } else if (raw.toLowerCase().includes("no candles")) {
      detail = "The data source returned no candles for the selected period";
    }
    return `${prefix}: ${detail}`;
  }

  function buildRequest(get, sourceTimeframe, sourceDelayMinutes = 0) {
    return {
      adapter_id: get("adapterSelect").value,
      engine: get("engineSelect").value,
      market: get("marketSelect").value,
      board: get("boardSelect").value,
      security: get("instrumentSelect").value,
      instrument_mode: get("instrumentMode").value,
      from_date: get("dataFromDate").value,
      till_date: get("dataTillDate").value,
      timeframe: sourceTimeframe,
      preview_timeframe: get("chartTimeframeSelect").value || sourceTimeframe,
      cache_policy: get("cachePolicy").value || "prefer",
      roll_rule: get("rollRule").value || null,
      source_delay_minutes: sourceDelayMinutes,
      rules_path: get("rulesPath")?.value?.trim() || null,
      rules_enforcement: get("rulesEnforcement")?.value || "audit",
      history_source: get("historySource")?.value || "auto",
      archive_fallback_policy: get("archiveFallbackPolicy")?.value || "missing_only",
    };
  }

  function requiredSourceTimeframe(available, strategyTimeframe, chartTimeframe) {
    const targets = [strategyTimeframe, chartTimeframe].filter(Boolean);
    const targetMinutes = targets.map(timeframeMinutes);
    const candidates = (available || [])
      .map((value) => ({ value, minutes: timeframeMinutes(value) }))
      .filter((item) => targetMinutes.every((target) => target % item.minutes === 0))
      .sort((left, right) => right.minutes - left.minutes);
    if (!candidates.length) {
      throw new Error(`No source timeframe can build strategy ${strategyTimeframe} and chart ${chartTimeframe}`);
    }
    return candidates[0].value;
  }

  function timeframeMinutes(value) {
    const match = /^(\d+)(m|h|d)$/.exec(String(value || ""));
    if (!match) throw new Error(`Unsupported timeframe: ${value}`);
    return Number(match[1]) * { m: 1, h: 60, d: 1440 }[match[2]];
  }

  function datePart(value) {
    return value ? String(value).slice(0, 10) : "";
  }

  return {
    marketSelection,
    adapterBase,
    adapterQuery,
    bestMatchingDataset,
    bestChartDataset,
    buildRequest,
    dateRangeLimits,
    datasetLabel,
    datasetFreshness,
    datePart,
    defaultDateRange,
    errorMessage,
    instrumentLabel,
    matchesDataset,
    normalizeDateRange,
    qualityAllows,
    requiredSourceTimeframe,
    savedHistoryRange,
    timeframeMinutes,
    validateSelection,
  };
})();
