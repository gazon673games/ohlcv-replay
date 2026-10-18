const WorkbenchChartControls = (() => {
  const { $ } = WorkbenchCore;
  function init() {
    $("zoomInButton").addEventListener("click", () => WorkbenchMarketChart.control("in"));
    $("zoomOutButton").addEventListener("click", () => WorkbenchMarketChart.control("out"));
    $("autoScaleButton").addEventListener("click", () => WorkbenchMarketChart.control("auto"));
    $("crosshairButton").addEventListener("click", () => {
      WorkbenchMarketChart.control("crosshair");
      const button = $("crosshairButton");
      button.setAttribute("aria-pressed", String(button.getAttribute("aria-pressed") !== "true"));
    });
    initReadout();
    $("marketChart").addEventListener("keydown", event => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const action = { "+": "in", "=": "in", "-": "out", "ArrowLeft": "left", "ArrowRight": "right" }[event.key];
      if (action) { event.preventDefault(); WorkbenchMarketChart.control(action); }
      if (event.key === "Home") { event.preventDefault(); WorkbenchMarketChart.fitContent(); }
    });
    const menu = $("chartContextMenu");
    $("marketChart").addEventListener("contextmenu", event => {
      event.preventDefault();
      menu.hidden = false;
      menu.style.left = `${Math.max(0, Math.min(event.clientX, window.innerWidth - menu.offsetWidth))}px`;
      menu.style.top = `${Math.max(0, Math.min(event.clientY, window.innerHeight - menu.offsetHeight))}px`;
      menu.querySelector("button").focus();
    });
    menu.addEventListener("click", event => {
      const action = event.target.closest("[data-chart-action]")?.dataset.chartAction;
      if (action === "fit") WorkbenchMarketChart.fitContent();
      if (action === "auto") WorkbenchMarketChart.control("auto");
      if (action === "focus") WorkbenchWorkspace.toggleFocus();
      if (action === "trades") WorkbenchCore.showView("tradesView");
      menu.hidden = true;
    });
    document.addEventListener("pointerdown", event => { if (!menu.contains(event.target)) menu.hidden = true; });
    menu.addEventListener("keydown", event => {
      const buttons = [...menu.querySelectorAll("button")];
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        buttons[(buttons.indexOf(document.activeElement) + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length].focus();
      }
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !menu.hidden) { menu.hidden = true; $("marketChart").focus(); }
    });
  }

  function initReadout() {
    const readout = $("chartReadout");
    let key = null;
    let pending = "";
    let frame = null;
    WorkbenchMarketChart.onCrosshairMove((time, candle) => {
      const nextKey = candle ? `${time}:${candle.open}:${candle.high}:${candle.low}:${candle.close}` : "";
      if (nextKey === key) return;
      key = nextKey;
      pending = candle
        ? `${WorkbenchTime.formatMarketDateTime(time)}  O ${candle.open}  H ${candle.high}  L ${candle.low}  C ${candle.close}` : "";
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (readout.textContent !== pending) readout.textContent = pending;
      });
    });
  }
  return { init };
})();
