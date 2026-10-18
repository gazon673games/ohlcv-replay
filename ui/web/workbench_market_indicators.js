const WorkbenchMarketIndicators = (() => {
  const PRICE_PANE = 0;
  const EQUITY_PANE = 1;
  const dataTools = WorkbenchMarketChartData;

  function render(chart, rows, settings, setData) {
    const series = [];
    if (settings.showSma) {
      addLine(series, chart, rows, "chart_sma", `SMA ${periodLabel(settings.smaPeriod, settings.timeframe)}`, settings.smaColor, setData, {
        lastValueVisible: true,
        lineWidth: 3,
        matchPricePrecision: true,
      });
    }
    if (settings.showEma) {
      addLine(series, chart, rows, "chart_ema", `EMA ${periodLabel(settings.emaPeriod, settings.timeframe)}`, settings.emaColor, setData, {
        dashed: true,
        lastValueVisible: true,
        lineWidth: 3,
        matchPricePrecision: true,
      });
    }
    if (settings.showBollinger) addBollinger(series, chart, rows, settings, setData);
    if (settings.showVolume) addVolume(series, chart, rows, settings, setData);
    if (settings.showInflation) addInflation(series, chart, rows, settings, setData);
    return series;
  }

  function addBollinger(series, chart, rows, settings, setData) {
    const suffix = `${periodLabel(settings.bollingerPeriod, settings.timeframe)} · ${settings.bollingerStdDev}σ`;
    addLine(series, chart, rows, "chart_bollinger_upper", `BB upper ${suffix}`, settings.bollingerColor, setData, { matchPricePrecision: true });
    addLine(series, chart, rows, "chart_bollinger_middle", `BB mid ${suffix}`, settings.bollingerColor, setData, { dashed: true, matchPricePrecision: true });
    addLine(series, chart, rows, "chart_bollinger_lower", `BB lower ${suffix}`, settings.bollingerColor, setData, { matchPricePrecision: true });
  }

  function addVolume(series, chart, rows, settings, setData) {
    const values = dataTools.normalizeRows(rows, (row) => {
      const item = dataTools.toVolume(row);
      if (item) item.color = settings.volumeColor;
      return item;
    });
    if (!values.length) return;
    const item = chart.addSeries(window.LightweightCharts.HistogramSeries, {
      title: WorkbenchI18n.t("volume"),
      priceFormat: { type: "volume" },
      priceLineVisible: false,
      lastValueVisible: false,
      priceScaleId: "volume",
    }, PRICE_PANE);
    item.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    setData(item, values);
    series.push(item);
  }

  function addInflation(series, chart, rows, settings, setData) {
    const title = `${WorkbenchI18n.t("inflation")} ${settings.inflationRate}%`;
    addLine(series, chart, rows, "chart_inflation", title, settings.inflationColor, setData, {
      priceScaleId: "inflation",
    });
    addLine(
      series,
      chart,
      rows,
      "chart_inflation",
      `${title} · ${WorkbenchI18n.t("capital")}`,
      settings.inflationCapitalColor,
      setData,
      { pane: EQUITY_PANE, scale: settings.initialCapital / 100 },
    );
  }

  function addLine(series, chart, rows, column, title, color, setData, options = {}) {
    const scale = options.scale || 1;
    const values = dataTools.normalizeRows(
      rows,
      (row) => dataTools.toScaledColumnLine(row, column, scale),
    );
    if (!values.length) return;
    const item = chart.addSeries(window.LightweightCharts.LineSeries, {
      color,
      lineWidth: options.lineWidth || 2,
      title,
      priceLineVisible: false,
      lastValueVisible: options.lastValueVisible || false,
      ...(options.matchPricePrecision ? { priceFormat: dataTools.priceFormat(rows) } : {}),
      ...(options.dashed ? { lineStyle: window.LightweightCharts.LineStyle.Dashed } : {}),
      ...(options.priceScaleId ? { priceScaleId: options.priceScaleId } : {}),
    }, options.pane ?? PRICE_PANE);
    setData(item, values);
    series.push(item);
  }

  function periodLabel(period, timeframe) {
    return `${period} × ${timeframe || "?"}`;
  }

  return { render };
})();
