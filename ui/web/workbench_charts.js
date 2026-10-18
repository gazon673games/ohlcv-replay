const WorkbenchCharts = (() => {
  const palette = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--chart-6"];
  const registry = new Map();
  const { formatValue, renderMetrics, renderQuality, renderTable } = WorkbenchFormat;
  const {
    cssColor,
    finite,
    formatTimestamp,
    inDomain,
    invertX,
    nearestRow,
    plotWidth,
    prepareCanvas,
    previousRow,
    ratio,
    resolveColor,
    timestamp,
    validRows,
    visibleDomain,
    xScale,
    yScale,
  } = WorkbenchChartPrimitives;
  const { drawLineSeries, numericRange } = WorkbenchChartSeries;
  let hoverTs = null;
  let pointerFrame = null;
  let redrawFrame = null;
  let pendingPointer = null;
  const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(
    (entries) => entries.forEach(({ target }) => renderCanvas(target)),
  );

  function drawLine(canvas, rows, column, color, options = {}) {
    drawMultiLine(canvas, [{ name: column, rows, column, color }], options);
  }

  function drawMultiLine(canvas, series, options = {}) {
    register(canvas, {
      series: series.map((item, index) => ({
        ...item,
        color: item.color || palette[index % palette.length],
      })),
      options,
    });
  }

  function drawDrawdown(canvas, rows, options = {}) {
    const supplied = rows.some((row) => finite(row.drawdown));
    let peak = -Infinity;
    const drawdown = rows.map((row) => {
      const equity = finite(row.equity_cash) ? Number(row.equity_cash) : Number(row.equity);
      peak = Math.max(peak, equity);
      const suppliedValue = Number(row.drawdown);
      return {
        ts: row.ts,
        value: supplied && Number.isFinite(suppliedValue)
          ? suppliedValue
          : peak ? equity / peak - 1 : 0,
      };
    });
    drawLine(canvas, drawdown, "value", "--drawdown", options);
  }

  function drawPlot(canvas, plots, options = {}) {
    const series = Object.keys(plots).map((name, index) => ({
      name,
      rows: plots[name] || [],
      column: "value",
      color: palette[index % palette.length],
    }));
    drawMultiLine(canvas, series, options);
  }

  function register(canvas, model) {
    if (!canvas) return;
    registry.set(canvas, model);
    bindEvents(canvas);
    renderCanvas(canvas);
  }

  function renderCanvas(canvas) {
    const model = registry.get(canvas);
    if (!model || canvas.offsetWidth === 0) return;
    prepareCanvas(canvas);
    renderLines(canvas, model);
  }

  function renderLines(canvas, model) {
    const allTimes = model.series.flatMap((item) => (item.rows || []).map((row) => timestamp(row.ts)));
    const domain = visibleDomain(allTimes, model.options);
    const prepared = model.series.map((item) => ({
      ...item,
      visible: validRows(item.rows || [], [item.column || "value"])
        .filter((row) => inDomain(timestamp(row.ts), domain)),
    }));
    const values = prepared.flatMap((item) => {
      const column = item.column || "value";
      return item.visible.map((row) => Number(row[column]));
    });
    if (!values.length) return;
    const ctx = canvas.getContext("2d");
    const x = xScale(canvas, domain);
    const [min, max] = numericRange(values, model.options.includeZero);
    const y = yScale(canvas, min, max);
    drawGrid(ctx, canvas);
    prepared.forEach((item) => drawLineSeries(ctx, item, x, y, plotWidth(canvas), ratio()));
    drawLegend(ctx, prepared.filter((item) => !item.positionState));
    drawCrosshair(ctx, canvas, domain, x);
    model.rendered = { domain, prepared, x, y };
  }

  function bindEvents(canvas) {
    if (canvas.dataset.chartBound) return;
    canvas.dataset.chartBound = "true";
    resizeObserver?.observe(canvas);
    canvas.addEventListener("mousemove", (event) => handlePointer(canvas, event));
    canvas.addEventListener("mouseleave", () => {
      pendingPointer = null;
      hoverTs = null;
      hideTooltip();
      scheduleRedraw(canvas);
    });
  }

  function handlePointer(canvas, event) {
    pendingPointer = { canvas, clientX: event.clientX, clientY: event.clientY };
    if (pointerFrame !== null) return;
    pointerFrame = requestAnimationFrame(processPointer);
  }

  function processPointer() {
    pointerFrame = null;
    const pointer = pendingPointer;
    pendingPointer = null;
    if (!pointer) return;
    const { canvas, clientX, clientY } = pointer;
    const model = registry.get(canvas);
    if (!model?.rendered) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const pixelX = (clientX - rect.left) * canvas.width / rect.width;
    hoverTs = invertX(canvas, model.rendered.domain, pixelX);
    showTooltip(model, clientX, clientY);
    renderCanvas(canvas);
  }

  function showTooltip(model, clientX, clientY) {
    const tooltip = model.options.tooltip;
    if (!tooltip || hoverTs === null) return;
    const rows = nearestSeriesRows(model.rendered.prepared, hoverTs);
    tooltip.textContent = rows.join("\n");
    tooltip.style.left = `${Math.min(window.innerWidth - 310, clientX + 12)}px`;
    tooltip.style.top = `${Math.min(window.innerHeight - 120, clientY + 12)}px`;
    tooltip.classList.remove("hidden");
  }

  function nearestSeriesRows(series, target) {
    const lines = [formatTimestamp(new Date(target).toISOString())];
    series.forEach((item) => {
      const row = item.stepped
        ? previousRow(item.visible, target)
        : nearestRow(item.visible, target);
      if (row) lines.push(`${item.name}: ${formatValue(row[item.column || "value"])}`);
    });
    return lines;
  }

  function drawGrid(ctx, canvas) {
    ctx.strokeStyle = cssColor("--grid");
    ctx.lineWidth = ratio();
    for (let index = 1; index < 4; index += 1) {
      const y = (canvas.height / 4) * index;
      ctx.beginPath();
      ctx.moveTo(10 * ratio(), y);
      ctx.lineTo(canvas.width - 10 * ratio(), y);
      ctx.stroke();
    }
  }

  function drawLegend(ctx, series) {
    let x = 12 * ratio();
    series.forEach((item) => {
      ctx.fillStyle = resolveColor(item.color);
      ctx.fillRect(x, 8 * ratio(), 10 * ratio(), 2 * ratio());
      ctx.fillStyle = cssColor("--text-soft");
      ctx.font = `${11 * ratio()}px sans-serif`;
      ctx.fillText(item.name, x + 14 * ratio(), 12 * ratio());
      x += (item.name.length * 7 + 34) * ratio();
    });
  }

  function drawCrosshair(ctx, canvas, domain, x) {
    if (hoverTs === null || !inDomain(hoverTs, domain)) return;
    ctx.strokeStyle = cssColor("--text-soft");
    ctx.setLineDash([3 * ratio(), 3 * ratio()]);
    ctx.beginPath();
    ctx.moveTo(x(hoverTs), 0);
    ctx.lineTo(x(hoverTs), canvas.height);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function redrawAll() {
    registry.forEach((_model, canvas) => {
      if (canvas.offsetWidth > 0) renderCanvas(canvas);
    });
  }

  function scheduleRedraw(canvas) {
    if (redrawFrame !== null) return;
    redrawFrame = requestAnimationFrame(() => {
      redrawFrame = null;
      renderCanvas(canvas);
    });
  }

  function hideTooltip() {
    document.getElementById("chartTooltip")?.classList.add("hidden");
  }

  return {
    drawDrawdown,
    drawLine,
    drawMultiLine,
    drawPlot,
    formatValue,
    renderMetrics,
    renderQuality,
    renderTable,
    redrawVisible: redrawAll,
  };
})();
