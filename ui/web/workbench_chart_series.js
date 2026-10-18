const WorkbenchChartSeries = (() => {
  function numericRange(values, includeZero = false) {
    let min = includeZero ? 0 : Infinity;
    let max = includeZero ? 0 : -Infinity;
    values.forEach((value) => {
      if (!Number.isFinite(value)) return;
      min = Math.min(min, value);
      max = Math.max(max, value);
    });
    return [min, max];
  }

  function transitionRows(rows, column) {
    if (!rows.length) return [];
    const result = [rows[0]];
    for (let index = 1; index < rows.length; index += 1) {
      if (Number(rows[index][column]) !== Number(rows[index - 1][column])) {
        result.push(rows[index]);
      }
    }
    if (result.at(-1) !== rows.at(-1)) result.push(rows.at(-1));
    return result;
  }

  function sampledRows(rows, width) {
    const step = Math.max(1, Math.floor(rows.length / Math.max(1, width)));
    if (step === 1) return rows;
    const result = rows.filter((_row, index) => index % step === 0);
    if (result.at(-1) !== rows.at(-1)) result.push(rows.at(-1));
    return result;
  }

  function drawLineSeries(ctx, item, x, y, width, pixelRatio) {
    if (!item.visible.length) return;
    const column = item.column || "value";
    const rows = item.stepped
      ? transitionRows(item.visible, column)
      : sampledRows(item.visible, width);
    if (item.positionState) {
      drawPositionSegments(ctx, item, rows, column, x, y, pixelRatio);
      return;
    }
    ctx.strokeStyle = WorkbenchChartPrimitives.resolveColor(item.color);
    ctx.lineWidth = 1.6 * pixelRatio;
    ctx.beginPath();
    let previousY = null;
    rows.forEach((row, index) => {
      const pointX = x(row._chartTs ?? WorkbenchChartPrimitives.timestamp(row.ts));
      const pointY = y(Number(row[column]));
      if (index === 0) ctx.moveTo(pointX, pointY);
      else if (item.stepped) {
        ctx.lineTo(pointX, previousY);
        ctx.lineTo(pointX, pointY);
      } else ctx.lineTo(pointX, pointY);
      previousY = pointY;
    });
    ctx.stroke();
  }

  function drawPositionSegments(ctx, item, rows, column, x, y, pixelRatio) {
    const colors = {
      long: WorkbenchChartPrimitives.resolveColor(item.positionColors.long),
      flat: WorkbenchChartPrimitives.resolveColor(item.positionColors.flat),
      short: WorkbenchChartPrimitives.resolveColor(item.positionColors.short),
    };
    ctx.lineWidth = 4 * pixelRatio;
    ctx.lineCap = "butt";
    for (let index = 0; index < rows.length - 1; index += 1) {
      const value = Number(rows[index][column]);
      ctx.strokeStyle = value > 0 ? colors.long : value < 0 ? colors.short : colors.flat;
      ctx.beginPath();
      ctx.moveTo(x(WorkbenchChartPrimitives.timestamp(rows[index].ts)), y(value));
      ctx.lineTo(x(WorkbenchChartPrimitives.timestamp(rows[index + 1].ts)), y(value));
      ctx.stroke();
    }
    ctx.lineCap = "butt";
  }

  return { drawLineSeries, numericRange, transitionRows };
})();
