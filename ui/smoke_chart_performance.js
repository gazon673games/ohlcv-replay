const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Deterministic stress data, independent of exchange access and backtest results.
function prepareFixture() {
  const start = Date.UTC(2024, 0, 2, 10) / 1000;
  const rows = Array.from({ length: 32000 }, (_, i) => {
    const close = 100 + Math.sin(i / 23) * 5 + i / 32000;
    return { ts: start + i * 60, open: close - 0.1, high: close + 0.3, low: close - 0.3, close };
  });
  window.__perfDecisions = rows.filter((_, i) => i % 4 === 0).map((row, i) => ({
    ts: row.ts, fill_ts: row.ts, order_id: `stress-${i}`, filled_contract_delta: i % 2 ? -1 : 1,
    action: i % 2 ? "close_long" : "open_long",
  }));
  WorkbenchWorkspace.toggleFocus();
  WorkbenchMarketChart.reset();
  WorkbenchMarketChart.setCandles(rows);
  WorkbenchMarketChart.setVisibleRange({ from: start + 30000 * 60, to: start + 30800 * 60 });
  document.getElementById("chartEmptyState").classList.add("hidden");
  window.__perfStart = start;
}

function beginMeasurement() {
  const sample = { frames: [], markerMs: [], formats: 0, readoutWrites: 0, longTasks: [] };
  const originalMarkers = WorkbenchMarketChartData.markerRows;
  WorkbenchMarketChartData.markerRows = (...args) => {
    const start = performance.now();
    const result = originalMarkers(...args);
    sample.markerMs.push(performance.now() - start);
    return result;
  };
  const originalFormat = WorkbenchTime.formatMarketTime;
  WorkbenchTime.formatMarketTime = (...args) => { sample.formats++; return originalFormat(...args); };
  const mutations = new MutationObserver(entries => { sample.readoutWrites += entries.length; });
  mutations.observe(document.getElementById("chartReadout"), { childList: true, characterData: true, subtree: true });
  const tasks = new PerformanceObserver(list => sample.longTasks.push(...list.getEntries().map(entry => entry.duration)));
  tasks.observe({ type: "longtask", buffered: false });
  let previous = performance.now();
  let frame;
  const tick = now => { sample.frames.push(now - previous); previous = now; frame = requestAnimationFrame(tick); };
  frame = requestAnimationFrame(tick);
  window.__perfSample = sample;
  window.__perfStop = () => {
    cancelAnimationFrame(frame);
    mutations.disconnect();
    tasks.disconnect();
    WorkbenchMarketChartData.markerRows = originalMarkers;
    WorkbenchTime.formatMarketTime = originalFormat;
  };
}

function finishMeasurement() {
  window.__perfStop();
  const sample = window.__perfSample;
  function distribution(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const round = value => Math.round((value || 0) * 100) / 100;
    return { count: sorted.length, median: round(sorted[Math.floor(sorted.length * 0.5)]),
      p95: round(sorted[Math.floor(sorted.length * 0.95)]), max: round(sorted.at(-1)) };
  }
  return { framesMs: distribution(sample.frames.slice(2)), markerMs: distribution(sample.markerMs),
    labelFormats: sample.formats, readoutWrites: sample.readoutWrites, longTasksMs: distribution(sample.longTasks),
    stats: WorkbenchMarketChart.stats() };
}

async function measureChartPerformance(window, app) {
  const evaluate = fn => window.webContents.executeJavaScript(`(${fn.toString()})()`);
  await evaluate(prepareFixture);
  await pause(500);
  const results = { viewport: await window.webContents.executeJavaScript(
    "({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })"), gpu: app.getGPUFeatureStatus(), scenarios: {} };
  for (const withMarkers of [false, true]) {
    await window.webContents.executeJavaScript(`WorkbenchMarketChart.setDecisions(${withMarkers ? "window.__perfDecisions" : "[]"})`);
    await pause(300);
    await evaluate(beginMeasurement);
    await window.webContents.executeJavaScript(`(async () => {
      for (let i = 0; i < 90; i++) {
        await new Promise(requestAnimationFrame);
        WorkbenchMarketChart.setVisibleRange({ from: window.__perfStart + (30000 + i) * 60,
          to: window.__perfStart + (30800 + i) * 60 });
      }
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    })()`);
    results.scenarios[withMarkers ? "rangeWithExecutions" : "rangeWithoutExecutions"] = await evaluate(finishMeasurement);
  }
  for (const withMarkers of [false, true]) {
    await window.webContents.executeJavaScript(`WorkbenchMarketChart.setDecisions(${withMarkers ? "window.__perfDecisions" : "[]"})`);
    await pause(100);
    await evaluate(beginMeasurement);
    await window.webContents.executeJavaScript(`(async () => {
      for (let i = 0; i < 60; i++) {
        await new Promise(requestAnimationFrame);
        WorkbenchMarketChart.setVisibleRange({ from: window.__perfStart + i * 60,
          to: window.__perfStart + (32000 + i) * 60 });
      }
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    })()`);
    results.scenarios[withMarkers ? "fullHistoryWithExecutions" : "fullHistoryWithoutExecutions"] = await evaluate(finishMeasurement);
  }
  await window.webContents.executeJavaScript(`WorkbenchMarketChart.setVisibleRange({
    from: window.__perfStart + 30000 * 60, to: window.__perfStart + 30800 * 60 })`);
  await pause(200);
  const rect = await window.webContents.executeJavaScript(`(() => {
    const r = document.getElementById("marketChart").getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), width: r.width };
  })()`);
  const send = (type, x, y) => window.webContents.sendInputEvent({ type, x, y, button: "left", clickCount: 1 });
  for (const drag of [false, true]) {
    send("mouseMove", rect.x, rect.y);
    if (drag) send("mouseDown", rect.x, rect.y);
    await evaluate(beginMeasurement);
    for (let i = 0; i < 120; i++) {
      // Crosshair stays in one candle; drag sweeps through the visible range.
      send("mouseMove", rect.x + (drag ? Math.round(Math.sin(i / 20) * rect.width * 0.2) : 0), rect.y + i % 20);
      await pause(16);
    }
    if (drag) send("mouseUp", rect.x, rect.y);
    await pause(80);
    results.scenarios[drag ? "mouseDrag" : "crosshair"] = await evaluate(finishMeasurement);
  }
  assert.equal(results.scenarios.mouseDrag.stats.candleCount, 32000);
  assert.equal(results.scenarios.mouseDrag.stats.markerCount, 8000);
  assert.notEqual(results.scenarios.mouseDrag.stats.visibleFrom, results.scenarios.crosshair.stats.visibleFrom,
    "trusted mouse drag must actually move the chart");
  await window.webContents.executeJavaScript(`WorkbenchMarketChart.onCrosshairMove((time, candle) => {
    if (candle) window.__perfCandle = { time, candle };
  })`);
  send("mouseMove", rect.x + 15, rect.y);
  await pause(100);
  results.exactOHLC = await window.webContents.executeJavaScript(`(() => {
    const observed = window.__perfCandle;
    if (!observed) return false;
    const i = (observed.time - window.__perfStart) / 60;
    const close = 100 + Math.sin(i / 23) * 5 + i / 32000;
    return Number.isInteger(i) && observed.candle.close === close && observed.candle.open === close - 0.1
      && observed.candle.high === close + 0.3 && observed.candle.low === close - 0.3;
  })()`);
  assert.ok(results.exactOHLC, "zoomed crosshair must expose exact source OHLC values");
  const file = path.resolve(process.env.WORKBENCH_SMOKE_PERFORMANCE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
  process.stdout.write(`[chart-performance] ${JSON.stringify(results)}\n`);
}

module.exports = { measureChartPerformance };
