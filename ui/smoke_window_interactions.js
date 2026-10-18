const assert = require("node:assert/strict");
const pause = () => new Promise(resolve => setTimeout(resolve, 60));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.02,
  `${message}: ${actual} != ${expected}`);
async function verifyWindowInteractions(window) {
  const evaluate = source => window.webContents.executeJavaScript(source);
  const read = () => evaluate(`(() => {
    const win = WorkbenchWindows.get("corner-smoke"), node = win.node.getBoundingClientRect();
    return { rect: win.rect, screen: { x: node.x, y: node.y, width: node.width, height: node.height },
      scale: Number(document.getElementById("windowDeck").dataset.scale) };
  })()`);
  const verifyChartCoordinates = async () => {
    await pause();
    const canvases = await evaluate(`[...document.querySelectorAll("#marketChart canvas, .multi-chart-canvas canvas")]
      .filter(c => c.clientWidth > 0).map(c => ({ width: c.clientWidth, screen: c.getBoundingClientRect().width }))`);
    assert.ok(canvases.length >= 4, "charts were not rendered");
    for (const canvas of canvases) assert.ok(Math.abs(canvas.width - canvas.screen) < 1,
      "chart hit testing does not match its screen coordinates");
  };
  const reset = () => evaluate(`(() => {
    document.getElementById("workspaceZoomReset").click();
    const win = WorkbenchWindows.get("corner-smoke");
    win.rect = { x: 100, y: 80, width: 440, height: 280 }; WorkbenchWindows.show(win.id);
  })()`);
  const drag = async (corner, dx, dy) => {
    const before = await read();
    const x = Math.round(corner ? before.screen.x + (corner.includes("w") ? 3 : before.screen.width - 3)
      : before.screen.x + 70);
    const y = Math.round(corner ? before.screen.y + (corner.includes("n") ? 3 : before.screen.height - 3)
      : before.screen.y + 15 * before.scale);
    const hit = await evaluate(`document.elementFromPoint(${x}, ${y})?.className`);
    assert.ok(String(hit).includes(corner ? "window-resize" : "window-titlebar")
      || (!corner && hit === ""), `pointer missed ${corner || "titlebar"}: ${hit}`);
    window.webContents.sendInputEvent({ type: "mouseDown", button: "left", x, y, clickCount: 1 });
    window.webContents.sendInputEvent({ type: "mouseMove", x: x + dx, y: y + dy });
    window.webContents.sendInputEvent({ type: "mouseUp", button: "left", x: x + dx, y: y + dy, clickCount: 1 });
    await pause();
    return { before, after: await read() };
  };
  await evaluate(`(() => {
    document.getElementById("workspaceZoomReset").click();
    WorkbenchWindows.create({ id: "corner-smoke", title: "Resize check",
      content: document.createElement("div"), persistent: false, open: true });
    const candles = [0, 1, 2].map(i => ({ ts: new Date(Date.UTC(2025, 0, 1, i)).toISOString(),
      open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i }));
    WorkbenchMultiChart.open({ asset_id: "ZOOM", candles, fills: [] }, "zoom-chart-smoke");
    const extra = WorkbenchWindows.get("zoom-chart-smoke");
    extra.rect = { x: 700, y: 30, width: 500, height: 300 }; WorkbenchWindows.show(extra.id);
    const canvas = document.createElement("canvas"); canvas.id = "zoom-hover-probe";
    canvas.height = 120; canvas.style.width = "100%";
    const tooltip = document.createElement("div"); tooltip.id = "zoom-hover-tooltip";
    WorkbenchWindows.get("corner-smoke").body.append(canvas, tooltip);
    WorkbenchCharts.drawLine(canvas, [{ ts: "2025-01-01T00:00:00", value: 0 },
      { ts: "2025-01-02T00:00:00", value: 10 }], "value", "--chart-1", { tooltip });
    for (const win of document.querySelectorAll(".workbench-window")) {
      if (win.querySelectorAll(".window-resize").length !== 4) throw new Error("window missing resize corners");
    }
  })()`);
  try {
    for (const corner of ["nw", "ne", "sw", "se"]) {
      await reset();
      const dx = corner.includes("w") ? 20 : -20, dy = corner.includes("n") ? 20 : -20;
      const { before, after } = await drag(corner, dx, dy);
      near(after.rect.width, before.rect.width - 20, corner + " width");
      near(after.rect.height, before.rect.height - 20, corner + " height");
      near(after.rect.x, before.rect.x + (corner.includes("w") ? 20 : 0), corner + " x");
      near(after.rect.y, before.rect.y + (corner.includes("n") ? 20 : 0), corner + " y");
    }
    await reset();
    const nativePoint = await read();
    window.webContents.sendInputEvent({ type: "mouseWheel", x: Math.round(nativePoint.screen.x + 100),
      y: Math.round(nativePoint.screen.y + 100), deltaY: -120, modifiers: ["control"], canScroll: true });
    await pause();
    assert.ok((await read()).scale < 1, "native Ctrl+wheel did not zoom out");
    assert.equal(window.webContents.getZoomFactor(), 1, "native Ctrl+wheel changed browser zoom");
    await reset();
    const zoom = await evaluate(`(() => {
      const deck = document.getElementById("windowDeck"), area = deck.getBoundingClientRect();
      const chart = document.getElementById("marketChart");
      const initialRange = WorkbenchMarketChart.getVisibleRange();
      const clientX = area.left + 200, clientY = area.top + 160;
      const wheel = ctrlKey => new WheelEvent("wheel", { ctrlKey, deltaY: 120,
        clientX, clientY, bubbles: true, cancelable: true });
      const ordinary = wheel(false); WorkbenchWindows.get("corner-smoke").body.dispatchEvent(ordinary);
      if (ordinary.defaultPrevented || Number(deck.dataset.scale) !== 1) throw new Error("ordinary wheel changed workspace");
      const event = wheel(true); chart.dispatchEvent(event);
      if (!event.defaultPrevented) throw new Error("Ctrl+wheel was not captured");
      const stored = JSON.parse(localStorage.getItem("workbench.windowViewport.v1"));
      if (JSON.stringify(initialRange) !== JSON.stringify(WorkbenchMarketChart.getVisibleRange()))
        throw new Error("workspace wheel changed chart range");
      const win = WorkbenchWindows.get("corner-smoke"), screen = win.node.getBoundingClientRect();
      return { scale: Number(deck.dataset.scale), stored, logical: win.rect, physicalWidth: screen.width,
        anchorX: (clientX - area.left - stored.x) / stored.scale,
        anchorY: (clientY - area.top - stored.y) / stored.scale };
    })()`);
    assert.ok(zoom.scale < 1); near(zoom.scale, zoom.stored.scale, "zoom persistence");
    await verifyChartCoordinates();
    await evaluate(`(() => {
      const canvas = document.getElementById("zoom-hover-probe"), rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent("mousemove", {
        clientX: rect.left + rect.width * 0.6, clientY: rect.top + 30, bubbles: true }));
    })()`);
    await pause();
    assert.match(await evaluate('document.getElementById("zoom-hover-tooltip").textContent'), /value: 10/,
      "diagnostic chart hover shifted under workspace zoom");
    near(zoom.physicalWidth, zoom.logical.width * zoom.scale, "scaled window width");
    near(zoom.anchorX, 200, "cursor anchor x"); near(zoom.anchorY, 160, "cursor anchor y");
    const moved = await drag(null, 20, 20);
    near(moved.after.rect.x - moved.before.rect.x, 20 / zoom.scale, "zoomed drag x");
    near(moved.after.rect.y - moved.before.rect.y, 20 / zoom.scale, "zoomed drag y");
    for (const corner of ["nw", "ne", "sw", "se"]) {
      const dx = corner.includes("w") ? 10 : -10, dy = corner.includes("n") ? 10 : -10;
      const { before, after } = await drag(corner, dx, dy);
      near(after.rect.width, before.rect.width - 10 / zoom.scale, "zoomed " + corner + " width");
      near(after.rect.height, before.rect.height - 10 / zoom.scale, "zoomed " + corner + " height");
    }
    const maximized = await evaluate(`(() => {
      WorkbenchWindows.maximize("corner-smoke");
      const win = WorkbenchWindows.get("corner-smoke"), node = win.node.getBoundingClientRect();
      const deck = document.getElementById("windowDeck").getBoundingClientRect();
      return { x: node.x - deck.x, y: node.y - deck.y, width: node.width, height: node.height,
        deckWidth: deck.width, deckHeight: deck.height,
        handlesHidden: [...win.node.querySelectorAll(".window-resize")].every(n => getComputedStyle(n).display === "none") };
    })()`);
    near(maximized.x, 0, "maximized x"); near(maximized.y, 0, "maximized y");
    near(maximized.width, maximized.deckWidth, "maximized width");
    near(maximized.height, maximized.deckHeight, "maximized height");
    assert.ok(maximized.handlesHidden);
    await evaluate('WorkbenchWindows.maximize("corner-smoke")');
    await reset();
    assert.equal((await read()).scale, 1);
    const highZoom = await evaluate(`(() => {
      const deck = document.getElementById("windowDeck"), area = deck.getBoundingClientRect();
      const win = WorkbenchWindows.get("corner-smoke"), screen = win.node.getBoundingClientRect();
      for (let i = 0; i < 8; i++) win.body.dispatchEvent(new WheelEvent("wheel", {
        ctrlKey: true, deltaY: -120, bubbles: true, cancelable: true,
        clientX: screen.x, clientY: screen.y }));
      return Number(deck.dataset.scale);
    })()`);
    assert.equal(highZoom, 2);
    await verifyChartCoordinates();
    const enlarged = await drag("nw", 20, 20);
    near(enlarged.after.rect.width, enlarged.before.rect.width - 10, "200% resize width");
    near(enlarged.after.rect.height, enlarged.before.rect.height - 10, "200% resize height");
    assert.equal(window.webContents.getZoomFactor(), 1, "workspace zoom changed browser zoom");
  } finally {
    await evaluate('document.getElementById("workspaceZoomReset").click(); WorkbenchWindows.remove("corner-smoke"); WorkbenchWindows.remove("zoom-chart-smoke")');
  }
  process.stdout.write("four-corner pointer resizing, Ctrl+wheel, zoomed dragging/resizing and maximize passed\n");
}
module.exports = { verifyWindowInteractions };
