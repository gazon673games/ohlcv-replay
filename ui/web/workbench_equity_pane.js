const WorkbenchEquityPane = (() => {
  function create(chart, setData) {
    let series = null;
    let count = 0;
    let lastTime = null;
    let panePresent = false;
    const tools = WorkbenchMarketChartData;
    function ensure() {
      if (!series) series = chart.addSeries(window.LightweightCharts.LineSeries, tools.equityOptions(), 1);
      return series;
    }
    function refresh() {
      const panes = chart.panes();
      if (panes.length > 1 && !panePresent) size();
      panePresent = panes.length > 1;
      const container = document.getElementById("marketChart");
      container.classList?.toggle("has-equity", panes.length > 1);
      container.parentElement?.classList.toggle("has-equity", panes.length > 1);
    }
    function set(rows) {
      const values = tools.normalizeRows(rows, tools.toEquity);
      if (values.length) setData(ensure(), values);
      else if (series) {
        setData(series, []);
        chart.removeSeries(series);
        series = null;
      }
      count = values.length;
      lastTime = values.at(-1)?.time ?? null;
      refresh();
    }
    function append(rows) {
      const values = tools.normalizeRows(rows, tools.toEquity);
      for (const item of values) {
        if (lastTime !== null && item.time < lastTime) continue;
        if (item.time !== lastTime) count++;
        lastTime = item.time;
        ensure().update(item);
      }
      refresh();
    }
    function size() {
      const pane = chart.panes()[1];
      if (pane) pane.setHeight(Math.max(80, document.getElementById("marketChart").clientHeight * 0.27));
    }
    return { set, append, refresh, size, stats: () => ({ equityCount: count }),
      applyPreferences: () => series?.applyOptions(tools.equityOptions()) };
  }
  return { create };
})();
