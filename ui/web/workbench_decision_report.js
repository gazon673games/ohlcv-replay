const WorkbenchDecisionReport = (() => {
  function decisionRows(rows) {
    return (rows || []).map((row) => {
      const features = parseFeatures(row.strategy_features);
      return {
        decision: WorkbenchTime.formatMarketDateTime(row.ts),
        action: actionText(row),
        rationale: rationaleText(row, features),
        execution: executionText(row),
        position: positionText(row),
      };
    });
  }

  function tradeRows(rows, config = {}) {
    const currency = config.instrument?.pnl_currency || config.portfolio?.base_currency || "";
    return (rows || []).map((row) => ({
      trade: `#${row.trade_id ?? "—"} · ${directionText(row.direction || row.side)}`,
      entry: pointText(row.entry_ts, row.entry_price),
      exit: pointText(row.exit_ts, row.exit_price),
      result: `${signed(row.net_pnl)} ${currency} (gross ${signed(row.gross_pnl)})`.trim(),
      costs: `${number(row.cost_cash)} ${currency}`.trim(),
      duration: language({ ru: `${row.holding_bars ?? "—"} баров`, en: `${row.holding_bars ?? "—"} bars` }),
      exitReason: row.closed_by_end_of_data
        ? language({ ru: "Закрыта концом данных", en: "Closed at end of data" })
        : language({ ru: "Изменение целевой позиции", en: "Target position changed" }),
    }));
  }

  function decisionColumns() {
    return labels({
      decision: ["Решение (биржевое время)", "Decision (exchange time)"],
      action: ["Действие", "Action"],
      rationale: ["Почему", "Why"],
      execution: ["Исполнение", "Execution"],
      position: ["Позиция", "Position"],
    });
  }

  function tradeColumns() {
    return labels({
      trade: ["Сделка", "Trade"], entry: ["Вход", "Entry"], exit: ["Выход", "Exit"],
      result: ["Результат", "Result"], costs: ["Издержки", "Costs"],
      duration: ["Длительность", "Duration"], exitReason: ["Закрытие", "Exit"],
    });
  }

  function actionText(row) {
    const delta = finite(row.filled_contract_delta, row.contract_delta, 0);
    const quantity = number(Math.abs(delta));
    const names = {
      open_long: ["Открыт лонг", "Opened long"], open_short: ["Открыт шорт", "Opened short"],
      close_long: ["Закрыт лонг", "Closed long"], close_short: ["Закрыт шорт", "Closed short"],
      reverse_short_to_long: ["Разворот из шорта в лонг", "Reversed short to long"],
      reverse_long_to_short: ["Разворот из лонга в шорт", "Reversed long to short"],
      hold_long: ["Лонг сохранён", "Long held"], hold_short: ["Шорт сохранён", "Short held"],
      hold_flat: ["Без позиции", "Stayed flat"],
    };
    const title = pair(names[String(row.action || "")], String(row.action || "—"));
    if (!delta) return title;
    const operation = delta > 0
      ? language({ ru: `куплено ${quantity}`, en: `bought ${quantity}` })
      : language({ ru: `продано ${quantity}`, en: `sold ${quantity}` });
    return `${title}: ${operation}`;
  }

  function rationaleText(row, features) {
    const reason = String(row.strategy_reason || row.reason || row.signal_reason || "");
    const side = features.side || (reason.startsWith("short") ? "short" : "long");
    const close = finite(features.close);
    const sma = finite(features.sma, features.session_sma);
    const parts = [reasonTitle(reason, row.action)];
    if (Number.isFinite(close) && Number.isFinite(sma)) {
      const passes = side === "short" ? close < sma : close > sma;
      const relation = close === sma ? "=" : close < sma ? "<" : ">";
      parts.push(language({
        ru: `Цена сигнальной свечи ${number(close)} ${relation} SMA ${number(sma)} — ценовое условие ${passes ? "выполнено" : "не выполнено"}.`,
        en: `Signal close ${number(close)} ${relation} SMA ${number(sma)} — price condition ${passes ? "passed" : "failed"}.`,
      }));
    }
    const bars = finite(features.sessionBars, features.session_bar_count);
    if (Number.isFinite(bars)) {
      const from = features.sessionFrom || features.session_start;
      const range = rangeText(features.minBars ?? features.min_session_bars, features.maxBars ?? features.max_session_bars);
      parts.push(language({
        ru: `В расчёте ${number(bars)} сессионных свечей${from ? ` с ${from}` : ""}${range}.`,
        en: `${number(bars)} session bars${from ? ` from ${from}` : ""}${range}.`,
      }));
    }
    conditionPart(parts, features.priceAllows, "ценовой фильтр", "price filter");
    conditionPart(parts, features.filterAllows, "фильтр последних свечей", "recent-bars filter");
    conditionPart(parts, features.weekdayAllows, "фильтр дня недели", "weekday filter");
    return parts.filter(Boolean).join(" ");
  }

  function reasonTitle(reason, action) {
    const current = String(action || "");
    const titles = {
      short_signal: ["Получен сигнал на шорт.", "Short signal passed."],
      long_signal: ["Получен сигнал на лонг.", "Long signal passed."],
      insufficient_margin_add_skipped: ["Добор пропущен: недостаточно средств на обеспечение и издержки.", "Addition skipped: insufficient funds for margin and costs."],
      session_bar_count: ["Число сессионных свечей вне допустимого диапазона.", "Session bar count is outside the allowed range."],
      unexpected_decision_time: ["Вызов произошёл вне настроенного времени решений.", "Called outside configured decision times."],
    };
    if (titles[reason]) return pair(titles[reason], reason);
    if (reason === "long_conditions_failed") return language({
      ru: current === "close_long" ? "Условия лонга не выполнены, поэтому существующий лонг закрыт." : "Условия лонга не выполнены; противоположная позиция сохранена.",
      en: current === "close_long" ? "Long conditions failed, so the existing long was closed." : "Long conditions failed; the opposite position was retained.",
    });
    if (reason === "short_conditions_failed") return language({
      ru: current === "close_short" ? "Условия шорта не выполнены, поэтому существующий шорт закрыт." : "Условия шорта не выполнены; противоположная позиция сохранена.",
      en: current === "close_short" ? "Short conditions failed, so the existing short was closed." : "Short conditions failed; the opposite position was retained.",
    });
    return reason || language({ ru: "Причина не указана.", en: "No reason supplied." });
  }

  function executionText(row) {
    if (row.order_status === "rejected_insufficient_margin") {
      return language({ ru: "Добор не исполнен; текущая позиция сохранена", en: "Addition not filled; existing position retained" });
    }
    const delta = finite(row.filled_contract_delta, row.contract_delta, 0);
    if (!delta) return language({ ru: "Сделки нет: изменение позиции не требовалось", en: "No trade: position change not required" });
    const status = row.order_status === "filled"
      ? language({ ru: "исполнено", en: "filled" })
      : String(row.order_status || "—");
    return `${WorkbenchTime.formatMarketDateTime(row.fill_ts)} · ${number(row.fill_price)} · ${status}`;
  }

  function positionText(row) {
    return `${positionName(row.previous_position, row.previous_contracts)} → ${positionName(row.target_position, row.target_contracts)}`;
  }

  function positionName(position, contracts) {
    const value = finite(contracts, position, 0);
    if (value > 0) return language({ ru: `лонг ${number(Math.abs(value))}`, en: `long ${number(Math.abs(value))}` });
    if (value < 0) return language({ ru: `шорт ${number(Math.abs(value))}`, en: `short ${number(Math.abs(value))}` });
    return language({ ru: "без позиции", en: "flat" });
  }

  function directionText(value) {
    if (value === "long") return language({ ru: "лонг", en: "long" });
    if (value === "short") return language({ ru: "шорт", en: "short" });
    return String(value || "—");
  }

  function pointText(ts, price) { return `${WorkbenchTime.formatMarketDateTime(ts)} · ${number(price)}`; }
  function signed(value) { const current = finite(value, 0); return `${current > 0 ? "+" : ""}${number(current)}`; }
  function number(value) { return Number.isFinite(Number(value)) ? Number(value).toLocaleString(language({ ru: "ru-RU", en: "en-US" }), { maximumFractionDigits: 6 }) : "—"; }
  function finite(...values) { return values.map(Number).find(Number.isFinite) ?? NaN; }
  function parseFeatures(value) { try { return typeof value === "object" ? value || {} : JSON.parse(value || "{}"); } catch { return {}; } }
  function language(value) { return document.documentElement.lang === "en" ? value.en : value.ru; }
  function pair(value, fallback) { return value ? language({ ru: value[0], en: value[1] }) : fallback; }
  function labels(values) { return Object.entries(values).map(([key, value]) => ({ key, label: pair(value, key) })); }
  function rangeText(minimum, maximum) {
    if (!Number.isFinite(Number(minimum)) || !Number.isFinite(Number(maximum))) return "";
    return language({ ru: `, допустимо ${number(minimum)}–${number(maximum)}`, en: `, allowed ${number(minimum)}–${number(maximum)}` });
  }
  function conditionPart(parts, value, ru, en) {
    if (typeof value !== "boolean") return;
    parts.push(language({ ru: `${ru}: ${value ? "пройден" : "не пройден"}.`, en: `${en}: ${value ? "passed" : "failed"}.` }));
  }

  return { decisionColumns, decisionRows, tradeColumns, tradeRows };
})();
