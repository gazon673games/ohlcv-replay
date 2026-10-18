const WorkbenchMultiChart = (() => {
  let sequence = 0;
  const instances = new Map();
  const data = WorkbenchMarketChartData;

  function open(asset = null, key = null, datasetId = null) {
    const id = key || `chart-${sequence + 1}`;
    if (instances.has(id)) {
      instances.get(id).setAsset(asset); WorkbenchWindows.show(id); return id;
    }
    sequence++;
    const content = document.createElement("div"); content.className = "multi-chart";
    const toolbar = document.createElement("div"); toolbar.className = "multi-chart-toolbar";
    const select = document.createElement("select"); select.setAttribute("aria-label", WorkbenchWindows.words("Датасет графика", "Chart dataset"));
    const reset = document.createElement("button"); reset.textContent = WorkbenchWindows.words("Весь период", "Fit range");
    const status = document.createElement("span"); status.setAttribute("role", "status");
    const canvas = document.createElement("div"); canvas.className = "multi-chart-canvas";
    toolbar.append(select, reset, status); content.append(toolbar, canvas);
    let chart, candles, markers, rows = [], fills = [], version = 0, disposed = false;
    function resize() {
      if (disposed || !canvas.clientWidth || !canvas.clientHeight) return;
      if (!chart) {
        chart = LightweightCharts.createChart(canvas, data.chartOptions(canvas, LightweightCharts));
        candles = chart.addSeries(LightweightCharts.CandlestickSeries, data.candleOptions());
        markers = WorkbenchMarketMarkers.create(LightweightCharts.createSeriesMarkers(candles, []));
        chart.timeScale().subscribeVisibleTimeRangeChange(renderMarkers);
        applyRows();
      }
      chart.resize(canvas.clientWidth, canvas.clientHeight);
    }
    function renderMarkers() { if (chart) markers.render(fills, rows, chart.timeScale().getVisibleRange()); }
    function setRows(raw, decisions = []) {
      rows = data.normalizeRows(raw, data.toCandle); fills = decisions;
      applyRows();
    }
    function applyRows() {
      if (!chart) return;
      candles.applyOptions({ priceFormat: data.priceFormat(rows) }); candles.setData(rows);
      markers.invalidate(); chart.timeScale().fitContent(); renderMarkers();
    }
    function setAsset(next) {
      if (!next) return;
      version++;
      WorkbenchWindows.rename(id, next.asset_id);
      select.hidden = true; status.textContent = WorkbenchWindows.words("Исполнения портфеля", "Portfolio fills");
      if (next.candle_stride > 1) status.textContent += ` · ${WorkbenchWindows.words("свечи графика", "chart candles")} ${next.candle_stride}×`;
      if (next.chart_warning) status.textContent = next.chart_warning;
      setRows(next.candles, next.fills); resize();
    }
    async function load() {
      const datasetId = select.value; if (!datasetId) return;
      const token = ++version;
      status.textContent = WorkbenchWindows.words("Загрузка…", "Loading…");
      try {
        const all = []; let offset = 0;
        while (true) {
          const payload = await WorkbenchApi.get(`/api/datasets/${encodeURIComponent(datasetId)}/preview?max_points=12000&limit=2000&offset=${offset}`);
          if (disposed || token !== version) return;
          all.push(...payload.rows); offset += payload.rows.length;
          if (payload.done || !payload.rows.length) break;
        }
        setRows(all); resize(); status.textContent = `${rows.length}`;
        WorkbenchWindows.rename(id, select.selectedOptions[0]?.textContent || datasetId);
      } catch (error) { if (!disposed && token === version) status.textContent = error.message; }
    }
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    function theme() {
      if (!chart) return;
      chart.applyOptions(data.chartOptions(canvas, LightweightCharts));
      candles.applyOptions(data.candleOptions()); markers.invalidate(); renderMarkers();
    }
    window.addEventListener("workbench-layout-change", resize);
    window.addEventListener("workbench-preferences-change", theme);
    const dispose = () => {
      disposed = true; version++; observer.disconnect(); chart?.remove();
      window.removeEventListener("workbench-layout-change", resize);
      window.removeEventListener("workbench-preferences-change", theme); instances.delete(id);
    };
    WorkbenchWindows.create({ id, title: asset?.asset_id || WorkbenchWindows.words("График", "Chart"),
      content, open: true, persistent: false, dispose,
      rect: { x: 25 + sequence * 18, y: 25 + sequence * 12, width: 650, height: 450 } });
    instances.set(id, { setAsset, stats: () => ({ rows: rows.length, fills: fills.length, disposed }) });
    reset.addEventListener("click", () => chart?.timeScale().fitContent());
    select.addEventListener("change", load);
    if (asset) setAsset(asset);
    else WorkbenchApi.get("/api/datasets").then(payload => {
      if (disposed) return;
      WorkbenchCore.fillSelect(select, (payload.items || []).filter(item => item.exists !== false).map(item => ({
        id: item.dataset_id, name: `${item.continuous_symbol || item.dataset_id} · ${item.timeframe || ""}`,
      })), datasetId || WorkbenchCore.state.dataset?.dataset_id);
      return load();
    }).catch(error => { if (!disposed) status.textContent = error.message; });
    return id;
  }
  function stats() { return [...instances].map(([id, instance]) => ({ id, ...instance.stats() })); }
  return { open, stats };
})();
