const assert = require("node:assert/strict");
const { waitForAutomaticMarket, waitForInstrumentSelector } = require("./smoke_wait");
const pause = () => new Promise(resolve => setTimeout(resolve, 80));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.03,
  `${message}: ${actual} != ${expected}`);

async function verifyUnboundedWorkspace(window) {
  const evaluate = source => window.webContents.executeJavaScript(source);
  const read = () => evaluate(`(() => {
    const win = WorkbenchWindows.get("unbounded-smoke"), deck = document.getElementById("windowDeck");
    const header = win.header.getBoundingClientRect(), node = win.node.getBoundingClientRect();
    const area = deck.getBoundingClientRect();
    return { rect: win.rect, scale: Number(deck.dataset.scale), width: deck.clientWidth, height: deck.clientHeight,
      header: { x: header.x, y: header.y, width: header.width, height: header.height },
      screen: { x: node.x, y: node.y, width: node.width, height: node.height },
      area: { x: area.x, y: area.y }, view: JSON.parse(localStorage.getItem("workbench.windowViewport.v1")) };
  })()`);
  const drag = async (dx, dy, corner = null) => {
    const before = await read();
    const x = Math.round(corner ? before.screen.x + (corner.includes("w") ? 3 : before.screen.width - 3)
      : before.header.x + 25);
    const y = Math.round(corner ? before.screen.y + (corner.includes("n") ? 3 : before.screen.height - 3)
      : before.header.y + before.header.height / 2);
    const hit = await evaluate(`document.elementFromPoint(${x}, ${y})?.closest(".${corner ? "window-resize" : "window-titlebar"}")?.closest("[data-window-id]")?.dataset.windowId`);
    assert.equal(hit, "unbounded-smoke", "drag did not hit the test window");
    window.webContents.sendInputEvent({ type: "mouseDown", button: "left", x, y, clickCount: 1 });
    window.webContents.sendInputEvent({ type: "mouseMove", x: x + dx, y: y + dy });
    window.webContents.sendInputEvent({ type: "mouseUp", button: "left", x: x + dx, y: y + dy, clickCount: 1 });
    await pause();
    return { before, after: await read() };
  };
  const moveTo = async (x, y) => {
    const before = await read();
    const dx = Math.round((x - before.rect.x) * before.scale), dy = Math.round((y - before.rect.y) * before.scale);
    const moved = await drag(dx, dy);
    near(moved.after.rect.x - before.rect.x, dx / before.scale, "unbounded drag x");
    near(moved.after.rect.y - before.rect.y, dy / before.scale, "unbounded drag y");
    return moved.after;
  };
  await evaluate(`(() => {
    document.getElementById("workspaceZoomReset").click();
    WorkbenchWindows.create({ id: "unbounded-smoke", title: "Unbounded workspace",
      content: document.createElement("div"), rect: { x: 100, y: 80, width: 440, height: 280 }, open: true });
    const deck = document.getElementById("windowDeck"), area = deck.getBoundingClientRect();
    for (let i = 0; i < 8; i++) deck.dispatchEvent(new WheelEvent("wheel", {
      ctrlKey: true, deltaY: 120, bubbles: true, cancelable: true,
      clientX: area.x + area.width / 2, clientY: area.y + area.height / 2 }));
  })()`);
  try {
    const initial = await read();
    assert.equal(initial.scale, 0.25);
    const right = await moveTo(initial.width + 100, initial.height + 80);
    assert.ok(right.rect.x > initial.width && right.rect.y > initial.height,
      "window was confined to the original screen");
    const expanded = await drag(20, 20, "se");
    near(expanded.after.rect.width, expanded.before.rect.width + 80, "resize beyond screen width");
    near(expanded.after.rect.height, expanded.before.rect.height + 80, "resize beyond screen height");
    const left = await moveTo(-500, -400);
    assert.ok(left.rect.x < 0 && left.rect.y < 0, "negative coordinates were blocked");
    const northwest = await drag(-20, -20, "nw");
    near(northwest.after.rect.x, northwest.before.rect.x - 80, "resize beyond left edge");
    near(northwest.after.rect.y, northwest.before.rect.y - 80, "resize beyond top edge");
    await moveTo(initial.width + 100, initial.height + 80);
    const away = await read();
    await evaluate(`(() => {
      window.dispatchEvent(new Event("resize"));
      WorkbenchWindows.hide("unbounded-smoke"); WorkbenchWindows.show("unbounded-smoke");
    })()`);
    assert.deepEqual((await read()).rect, away.rect, "layout reapplied the old screen bounds");
    await evaluate('document.getElementById("workspaceZoomReset").click()');
    assert.deepEqual((await read()).rect, away.rect, "zoom reset changed window coordinates");
    await evaluate('WorkbenchWindows.get("unbounded-smoke").button.click()');
    const revealed = await read();
    assert.deepEqual(revealed.rect, away.rect, "taskbar recovery moved the window");
    assert.ok(revealed.header.x >= revealed.area.x && revealed.header.y >= revealed.area.y,
      "taskbar did not bring the window into view");
    assert.ok(revealed.header.x < revealed.area.x + revealed.width
      && revealed.header.y < revealed.area.y + revealed.height);
    const x = Math.round(revealed.header.x + 40), y = Math.round(revealed.header.y + 50);
    window.webContents.sendInputEvent({ type: "mouseDown", button: "middle", x, y, clickCount: 1 });
    window.webContents.sendInputEvent({ type: "mouseMove", x: x + 40, y: y + 30 });
    window.webContents.sendInputEvent({ type: "mouseUp", button: "middle", x: x + 40, y: y + 30, clickCount: 1 });
    await pause();
    const panned = await read();
    assert.deepEqual(panned.rect, revealed.rect, "workspace pan moved an individual window");
    near(panned.screen.x - revealed.screen.x, 40, "workspace pan x");
    near(panned.screen.y - revealed.screen.y, 30, "workspace pan y");
    near(panned.view.x - revealed.view.x, 40, "saved pan x");
    near(panned.view.y - revealed.view.y, 30, "saved pan y");
    assert.equal(await evaluate('document.getElementById("windowDeck").classList.contains("workspace-panning")'), false);
    const url = window.webContents.getURL();
    await window.loadURL(url);
    await evaluate(`(async () => {
      const deadline = Date.now() + 10000;
      while (!document.getElementById("windowDeck") && Date.now() < deadline)
        await new Promise(resolve => setTimeout(resolve, 50));
      WorkbenchWindows.create({ id: "unbounded-smoke", title: "Unbounded workspace",
        content: document.createElement("div"), open: true });
    })()`);
    const restored = await read();
    assert.deepEqual(restored.rect, panned.rect, "reload lost off-screen window coordinates");
    assert.deepEqual(restored.view, panned.view, "reload lost workspace pan");
    near(restored.screen.x, panned.screen.x, "restored screen x");
    near(restored.screen.y, panned.screen.y, "restored screen y");
  } finally {
    await evaluate('document.getElementById("workspaceZoomReset").click(); WorkbenchWindows.remove("unbounded-smoke")');
  }
  await waitForInstrumentSelector(window);
  await waitForAutomaticMarket(window);
  process.stdout.write("unbounded movement/resizing, workspace pan, taskbar recovery and reload persistence passed\n");
}
module.exports = { verifyUnboundedWorkspace };
