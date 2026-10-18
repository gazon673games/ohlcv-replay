const WorkbenchChartPrimitives = (() => {
  function visibleDomain(values, options) {
    const sorted = [...new Set(values.filter(Number.isFinite))].sort((a, b) => a - b);
    if (!sorted.length) return [0, 1];
    const zoom = Math.max(1, Number(options.zoom || 1));
    const count = Math.max(2, Math.ceil(sorted.length / zoom));
    const maxStart = Math.max(0, sorted.length - count);
    const pan = Math.min(1, Math.max(0, Number(options.pan ?? 1)));
    const start = Math.round(maxStart * pan);
    const end = Math.min(sorted.length - 1, start + count - 1);
    return sorted[start] === sorted[end]
      ? [sorted[start] - 1, sorted[end] + 1]
      : [sorted[start], sorted[end]];
  }

  function xScale(canvas, domain) {
    const left = 12 * ratio();
    const width = plotWidth(canvas);
    return (value) => left + ((value - domain[0]) / (domain[1] - domain[0] || 1)) * width;
  }

  function invertX(canvas, domain, pixelX) {
    const left = 12 * ratio();
    const pct = Math.min(1, Math.max(0, (pixelX - left) / plotWidth(canvas)));
    return domain[0] + pct * (domain[1] - domain[0]);
  }

  function yScale(canvas, min, max) {
    const pad = 18 * ratio();
    if (min === max) {
      const margin = Math.abs(min) * 0.05 || 1;
      min -= margin;
      max += margin;
    }
    const range = max - min;
    return (value) => canvas.height - pad - ((value - min) / range) * (canvas.height - pad * 2);
  }

  function prepareCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const logicalHeight = Number(canvas.dataset.logicalHeight || canvas.getAttribute("height")) || 170;
    canvas.dataset.logicalHeight = String(logicalHeight);
    canvas.style.height = `${logicalHeight}px`;
    const width = Math.max(320, Math.floor(rect.width * ratio()));
    const height = Math.floor(logicalHeight * ratio());
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = cssColor("--surface");
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  function validRows(rows, columns) {
    return (rows || []).filter((row) => Number.isFinite(timestamp(row.ts))
      && columns.every((column) => finite(row[column])));
  }

  function nearestRow(rows, target) {
    if (!rows?.length) return null;
    let low = 0;
    let high = rows.length - 1;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (timestamp(rows[middle].ts) < target) low = middle + 1;
      else high = middle;
    }
    if (low === 0) return rows[0];
    const before = rows[low - 1];
    const after = rows[low];
    return target - timestamp(before.ts) <= timestamp(after.ts) - target ? before : after;
  }

  function previousRow(rows, target) {
    if (!rows?.length) return null;
    let low = 0;
    let high = rows.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (timestamp(rows[middle].ts) <= target) low = middle + 1;
      else high = middle - 1;
    }
    return rows[Math.max(0, high)];
  }

  function plotWidth(canvas) { return canvas.width - 24 * ratio(); }
  function timestamp(value) {
    return WorkbenchTime.marketTimestampMilliseconds(value);
  }
  function inDomain(value, domain) { return value >= domain[0] && value <= domain[1]; }
  function finite(value) {
    return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
  }
  function ratio() { return Math.min(2, window.devicePixelRatio || 1); }
  function formatTimestamp(value) { return String(value || "").replace("T", " ").slice(0, 19); }
  function cssColor(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function resolveColor(color) {
    return color.startsWith("--") ? cssColor(color) : color;
  }

  return {
    finite,
    cssColor,
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
  };
})();
