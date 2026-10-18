const assert = require("node:assert/strict");
async function verifyMarkerClick(window) {
  await window.webContents.executeJavaScript(`(() => {
    document.getElementById("tradeSearch").value = "";
    document.getElementById("tradeSearch").dispatchEvent(new Event("input"));
    document.querySelector('#tradesTable tr[data-trade-index="0"] button').click();
  })()`);
  await new Promise(resolve => setTimeout(resolve, 200));
  const points = await window.webContents.executeJavaScript(`(() => {
    WorkbenchCore.showView("overviewView");
    WorkbenchWindows.show("market");
    document.getElementById("tradeSearch").value = "__hidden_trade__";
    document.getElementById("tradeSearch").dispatchEvent(new Event("input"));
    const hex = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const points = [];
    for (const canvas of document.querySelectorAll("#marketChart canvas")) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 200 || rect.height < 100) continue;
      const { data } = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
      const groups = new Map();
      for (let y = 15; y < canvas.height - 15; y++) for (let x = 15; x < canvas.width - 15; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i + 3] < 200 || rgb.some((color, j) => Math.abs(data[i + j] - color) > 6)) continue;
        const key = Math.floor(x / 8) + ":" + Math.floor(y / 8);
        const group = groups.get(key) || { x: 0, y: 0, count: 0 };
        group.x += x; group.y += y; group.count++; groups.set(key, group);
      }
      for (const group of [...groups.values()].filter(g => g.count >= 15).sort((a, b) => b.count - a.count).slice(0, 8)) {
        points.push({ x: Math.round(rect.left + group.x / group.count * rect.width / canvas.width),
          y: Math.round(rect.top + group.y / group.count * rect.height / canvas.height) });
      }
    }
    return points;
  })()`);
  assert.ok(points.length, "rendered selected-trade markers were not found");
  for (const point of points) {
    window.webContents.sendInputEvent({ type: "mouseMove", ...point });
    await new Promise(resolve => setTimeout(resolve, 50));
    window.webContents.sendInputEvent({ type: "mouseDown", button: "left", clickCount: 1, ...point });
    window.webContents.sendInputEvent({ type: "mouseUp", button: "left", clickCount: 1, ...point });
    await new Promise(resolve => setTimeout(resolve, 80));
    const linked = await window.webContents.executeJavaScript(`document.getElementById("tradeSearch").value === ""
      && document.getElementById("tradesView").classList.contains("active")
      && Boolean(document.querySelector('#tradesTable tr.trade-selected[data-trade-index="0"]'))`);
    if (linked) return { realCanvasClick: true, trade: 1 };
  }
  throw new Error("clicking rendered markers did not reveal their trade row");
}
module.exports = { verifyMarkerClick };
