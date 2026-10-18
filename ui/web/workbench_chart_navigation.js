const WorkbenchChartNavigation = (() => {
  function tradeSelection(candles, trade, timing) {
    const entry = WorkbenchTime.marketTimestampSeconds(trade.entry_ts);
    const exit = WorkbenchTime.marketTimestampSeconds(trade.exit_ts);
    if (entry === null || exit === null || !candles.length || exit < entry) return null;
    const first = candles[0].time;
    const last = candles.at(-1).time;
    const step = Math.max(1, last - (candles.at(-2)?.time ?? last - 60));
    if (entry < first || exit > last + step) return null;
    const entryTime = WorkbenchMarketChartData.executionCandleTime(candles, entry, timing);
    const exitTime = WorkbenchMarketChartData.executionCandleTime(candles, exit, timing);
    const start = candles.findIndex(row => row.time === entryTime);
    const end = candles.findIndex(row => row.time === exitTime);
    const padding = Math.max(8, Math.round((end - start) * 0.15));
    const from = candles[Math.max(0, start - padding)].time;
    const to = candles[Math.min(candles.length - 1, end + padding)].time;
    const long = (trade.direction || trade.side) !== "short";
    const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    const label = document.documentElement.lang === "en" ? ["Entry", "Exit"] : ["Вход", "Выход"];
    const markers = [entryTime, exitTime].map((time, index) => ({
      time, position: (index === 0 ? long : !long) ? "belowBar" : "aboveBar",
      shape: "circle", color,
      text: `${label[index]} #${trade.trade_id ?? ""} · ${WorkbenchTime.formatMarketTime(index ? trade.exit_ts : trade.entry_ts)}`,
    }));
    return { range: { from, to: Math.max(from + 1, to) }, markers };
  }

  function control(chart, series, action) {
    if (action === "auto") { series.priceScale().applyOptions({ autoScale: true }); return; }
    const scale = chart.timeScale();
    const range = scale.getVisibleLogicalRange();
    if (!range) return;
    const span = Math.max(1, range.to - range.from);
    if (action === "left" || action === "right") {
      const shift = span * (action === "left" ? -0.2 : 0.2);
      scale.setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift });
    } else {
      const half = span * (action === "in" ? 0.4 : 0.625);
      const center = (range.from + range.to) / 2;
      scale.setVisibleLogicalRange({ from: center - half, to: center + half });
    }
  }
  return { control, tradeSelection };
})();
