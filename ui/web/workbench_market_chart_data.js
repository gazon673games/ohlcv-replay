const WorkbenchMarketChartData = (() => {
  const CLOSE_FILL_TIMINGS = new Set([
    "signal_close_to_same_close",
    "signal_close_to_next_bar_close",
    "signal_close_to_next_bar_close_to_following_close",
  ]);
  const ACTION_LABELS = new Map([
    ["open_long", ["Лонг", "Long"]],
    ["open_short", ["Шорт", "Short"]],
    ["close_long", ["Закр. лонг", "Close long"]],
    ["close_short", ["Закр. шорт", "Close short"]],
  ]);

  function normalizeRows(rows, convert) {
    const result = [];
    let ordered = true;
    for (const row of rows || []) {
      const item = convert(row);
      if (!item) continue;
      const previous = result.at(-1);
      if (previous && item.time < previous.time) {
        ordered = false;
        break;
      }
      if (previous?.time === item.time) result[result.length - 1] = item;
      else result.push(item);
    }
    if (ordered) return result;
    const byTime = new Map((rows || []).map(convert).filter(Boolean).map((item) => [item.time, item]));
    return [...byTime.values()].sort((left, right) => left.time - right.time);
  }

  function toCandle(row) {
    const time = timestamp(row.ts);
    const rawValues = [row.open, row.high, row.low, row.close];
    if (time === null || rawValues.some(missing)) return null;
    const values = rawValues.map(Number);
    if (values.some((value) => !Number.isFinite(value))) return null;
    return { time, open: values[0], high: values[1], low: values[2], close: values[3] };
  }

  function toEquity(row) {
    const time = timestamp(row.ts);
    const rawValue = row.equity_cash ?? row.equity;
    if (time === null || missing(rawValue)) return null;
    const value = Number(rawValue);
    return Number.isFinite(value) ? { time, value } : null;
  }

  function toColumnLine(row, column) {
    const time = timestamp(row.ts);
    if (row[column] === null || row[column] === undefined || row[column] === "") return null;
    const value = Number(row[column]);
    return time === null || !Number.isFinite(value) ? null : { time, value };
  }

  function toScaledColumnLine(row, column, scale) {
    const item = toColumnLine(row, column);
    if (item) item.value *= scale;
    return item;
  }

  function toVolume(row) {
    const time = timestamp(row.ts);
    if (row.volume === null || row.volume === undefined || row.volume === "") return null;
    const value = Number(row.volume);
    if (time === null || !Number.isFinite(value)) return null;
    const color = Number(row.close) >= Number(row.open)
      ? cssColor("--price-up")
      : cssColor("--price-down");
    return { time, value, color };
  }

  function priceFormat(rows, minimumPrecision = 2) {
    let precision = minimumPrecision;
    for (const row of rows || []) {
      for (const column of ["open", "high", "low", "close"]) {
        const value = Number(row[column]);
        if (!Number.isFinite(value)) continue;
        const decimal = value.toFixed(6).replace(/0+$/u, "").split(".")[1] || "";
        precision = Math.max(precision, decimal.length);
      }
      if (precision === 6) break;
    }
    return { type: "price", precision, minMove: 10 ** -precision };
  }

  function markerRows(rows, candles, visibleRange = null, maxVisibleLabels = 80) {
    const entries = markerIndex(rows, candles);
    const visible = entries.filter(({ marker }) => markerIsVisible(marker, visibleRange));
    if (visible.length <= maxVisibleLabels) {
      for (const { marker, row } of visible) marker.text = markerLabel(row, executedDelta(row));
    }
    return entries.map(({ marker }) => marker);
  }

  function markerIndex(rows, candles) {
    const executions = (rows || []).filter(isExecutionDecision);
    const colors = { buy: cssColor("--price-up"), sell: cssColor("--price-down") };
    return executions
      .map((row, index) => ({ row, marker: toMarker(row, candles, markerId(row, index), colors) }))
      .filter(({ marker }) => marker)
      .sort((left, right) => left.marker.time - right.marker.time);
  }

  function toMarker(row, candles, id, colors) {
    const time = timestamp(row.fill_ts ?? row.ts);
    if (time === null) return null;
    const delta = executedDelta(row);
    const isBuy = delta > 0;
    return {
      time: executionCandleTime(candles, time, row.execution_timing),
      position: isBuy ? "belowBar" : "aboveBar",
      color: isBuy ? colors.buy : colors.sell,
      shape: isBuy ? "arrowUp" : "arrowDown",
      text: "",
      id,
    };
  }

  function markerId(row, index) {
    const orderId = String(row.order_id || row.trade_id || "execution");
    return `${orderId}:${String(row.fill_ts ?? row.ts ?? "")}:${index}`;
  }

  function markerIsVisible(marker, range) {
    if (!range) return true;
    return marker.time >= Number(range.from) && marker.time <= Number(range.to);
  }

  function executionCandleTime(rows, fillTime, timing) {
    return containingTime(rows, fillTime, CLOSE_FILL_TIMINGS.has(timing));
  }

  function isExecutionDecision(row) {
    const delta = executedDelta(row);
    if (Object.hasOwn(row, "filled_contract_delta")) return Math.abs(delta) > 0;
    if (Math.abs(delta) > 0) return true;
    const action = String(row.action || "");
    return action.startsWith("open_") || action.startsWith("close_") || action.startsWith("reverse_");
  }

  function executedDelta(row) {
    const raw = Object.hasOwn(row, "filled_contract_delta")
      ? row.filled_contract_delta
      : row.contract_delta;
    const delta = Number(raw ?? 0);
    return Number.isFinite(delta) ? delta : 0;
  }

  function markerLabel(row, delta) {
    const action = String(row.action || "");
    const russian = document.documentElement.lang !== "en";
    const actionLabels = ACTION_LABELS.get(action);
    const fallbackLabel = russian
      ? (delta > 0 ? "Покупка" : "Продажа") : (delta > 0 ? "Buy" : "Sell");
    let label = actionLabels ? actionLabels[russian ? 0 : 1] : fallbackLabel;
    if (action.startsWith("reverse_")) label = russian
      ? (delta > 0 ? "↻ Лонг" : "↻ Шорт")
      : (delta > 0 ? "↻ Long" : "↻ Short");
    const fill = WorkbenchTime.formatMarketTime(row.fill_ts ?? row.ts);
    return `${label} · ${fill}`;
  }

  function containingTime(rows, target, excludeExact = false) {
    if (!rows.length) return target;
    let low = 0;
    let high = rows.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (excludeExact ? rows[middle].time < target : rows[middle].time <= target) low = middle + 1;
      else high = middle;
    }
    return rows[Math.max(0, low - 1)].time;
  }

  function timestamp(value) {
    return missing(value) ? null : WorkbenchTime.marketTimestampSeconds(value);
  }

  function missing(value) {
    return value === null || value === undefined || value === "";
  }

  function chartOptions(container, library) {
    return {
      autoSize: true,
      width: container.clientWidth,
      height: container.clientHeight,
      ...themeOptions(library),
      rightPriceScale: { borderColor: cssColor("--border"), minimumWidth: 90 },
      timeScale: {
        borderColor: cssColor("--border"),
        // Conflate only subpixel rendering; source candles and execution timestamps stay exact.
        enableConflation: true,
        conflationThresholdFactor: 1,
        lockVisibleTimeRangeOnResize: true,
        // Width changes must preserve the selected interval, including close trade views.
        maxBarSpacing: 0,
        // A 32k-point history must fit the full range even on a small workbench window.
        minBarSpacing: 0.01,
        timeVisible: true,
        secondsVisible: false,
      },
      localization: { locale: document.documentElement.lang === "en" ? "en-US" : "ru-RU" },
      handleScroll: true,
      handleScale: true,
    };
  }

  function candleOptions() {
    return {
      upColor: cssColor("--price-up"),
      downColor: cssColor("--price-down"),
      borderUpColor: cssColor("--price-up"),
      borderDownColor: cssColor("--price-down"),
      wickUpColor: cssColor("--price-up"),
      wickDownColor: cssColor("--price-down"),
      priceLineVisible: true,
    };
  }

  function equityOptions() {
    return {
      color: cssColor("--equity"),
      lineWidth: 2,
      title: "Equity",
      priceLineVisible: false,
      lastValueVisible: true,
    };
  }

  function themeOptions(library) {
    return {
      layout: {
        background: { type: library.ColorType.Solid, color: cssColor("--surface") },
        textColor: cssColor("--text-soft"),
        fontFamily: 'Inter, "Segoe UI", Arial, sans-serif',
        panes: {
          separatorColor: cssColor("--border"),
          separatorHoverColor: cssColor("--accent"),
        },
      },
      grid: {
        vertLines: { color: cssColor("--grid") },
        horzLines: { color: cssColor("--grid") },
      },
      crosshair: {
        mode: library.CrosshairMode.Normal,
        vertLine: { color: cssColor("--border-strong"), labelBackgroundColor: cssColor("--tooltip") },
        horzLine: { color: cssColor("--border-strong"), labelBackgroundColor: cssColor("--tooltip") },
      },
      localization: { locale: document.documentElement.lang === "en" ? "en-US" : "ru-RU" },
    };
  }

  function cssColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  return {
    executedDelta, isExecutionDecision, markerId, markerIndex, markerLabel,
    executionCandleTime,
    candleOptions,
    chartOptions,
    equityOptions,
    markerRows,
    normalizeRows,
    priceFormat,
    themeOptions,
    timestamp,
    toCandle,
    toColumnLine,
    toScaledColumnLine,
    toEquity,
    toVolume,
  };
})();
