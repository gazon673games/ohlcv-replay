const WorkbenchWindowGeometry = (() => {
  function normalize(rect) {
    const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
    return { x: finite(rect.x, 0), y: finite(rect.y, 0),
      width: Math.max(280, finite(rect.width, 600)), height: Math.max(160, finite(rect.height, 400)) };
  }
  function tile(count, width, height) {
    if (!count) return [];
    const columns = Math.ceil(Math.sqrt(count * width / Math.max(height, 1)));
    const rows = Math.ceil(count / columns);
    return Array.from({ length: count }, (_, i) => ({ x: (i % columns) * width / columns,
      y: Math.floor(i / columns) * height / rows, width: width / columns, height: height / rows }));
  }
  function resize(rect, corner, dx, dy) {
    let left = rect.x, top = rect.y, right = left + rect.width, bottom = top + rect.height;
    if (corner.includes("w")) left = Math.min(left + dx, right - 280);
    if (corner.includes("e")) right = Math.max(right + dx, left + 280);
    if (corner.includes("n")) top = Math.min(top + dy, bottom - 160);
    if (corner.includes("s")) bottom = Math.max(bottom + dy, top + 160);
    return { x: left, y: top, width: right - left, height: bottom - top };
  }
  function zoom(view, factor, x, y) {
    const scale = Math.max(0.25, Math.min(2, view.scale * factor));
    const ratio = scale / view.scale;
    return { scale, x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio };
  }
  return { normalize, tile, resize, zoom };
})();
