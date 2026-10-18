const WorkbenchWindowViewport = (() => {
  const storageKey = "workbench.windowViewport.v1";
  function create(deck, taskbar, changed) {
    let view = { scale: 1, x: 0, y: 0 }, pan = null;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey));
      if (stored && Number.isFinite(stored.scale) && stored.scale >= 0.25 && stored.scale <= 2
          && Number.isFinite(stored.x) && Number.isFinite(stored.y)) view = stored;
    } catch { /* Use the default viewport if storage is unavailable. */ }
    const surface = document.createElement("div"); surface.id = "windowSurface";
    const button = document.createElement("button"); button.type = "button";
    button.id = "workspaceZoomReset";
    const english = document.documentElement.lang === "en";
    button.title = english ? "Ctrl + wheel: zoom · middle drag: pan · click: 100%"
      : "Ctrl + колёсико: масштаб · средняя кнопка: перемещение · щелчок: 100%";
    button.setAttribute("aria-label", button.title);
    deck.append(surface); taskbar.append(button);
    function render() {
      surface.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
      surface.style.setProperty("--workspace-scale", view.scale);
      button.textContent = `${Math.round(view.scale * 100)}%`;
      deck.dataset.scale = String(view.scale);
    }
    function update(next) {
      view = next; render(); changed();
      try { localStorage.setItem(storageKey, JSON.stringify(view)); } catch { /* Storage may be disabled. */ }
    }
    const frame = () => ({ x: -view.x / view.scale, y: -view.y / view.scale,
      width: deck.clientWidth / view.scale, height: deck.clientHeight / view.scale });
    function reveal(rect) {
      const visible = frame();
      const overlap = Math.min(rect.x + rect.width, visible.x + visible.width) - Math.max(rect.x, visible.x);
      if (overlap >= Math.min(rect.width, 80) && rect.y >= visible.y
          && rect.y + 30 <= visible.y + visible.height) return;
      update({ ...view,
        x: deck.clientWidth / 2 - (rect.x + Math.min(rect.width, visible.width - 40) / 2) * view.scale,
        y: deck.clientHeight / 2 - (rect.y + Math.min(rect.height, visible.height - 40) / 2) * view.scale });
    }
    deck.addEventListener("pointerdown", event => {
      if (event.button !== 1) return;
      event.preventDefault(); event.stopImmediatePropagation();
      pan = { x: event.clientX, y: event.clientY, view: { ...view }, pointerId: event.pointerId };
      deck.setPointerCapture(event.pointerId); deck.classList.add("workspace-panning");
    }, { capture: true });
    deck.addEventListener("pointermove", event => {
      if (!pan || event.pointerId !== pan.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      update({ ...pan.view, x: pan.view.x + event.clientX - pan.x, y: pan.view.y + event.clientY - pan.y });
    }, { capture: true });
    const finishPan = event => {
      if (!pan || event.pointerId !== pan.pointerId) return;
      pan = null; deck.classList.remove("workspace-panning");
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      deck.addEventListener(type, finishPan, { capture: true });
    // Capture before charts and editors so Ctrl+wheel affects the desktop only.
    deck.addEventListener("wheel", event => {
      if (!event.ctrlKey) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (pan) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? deck.clientHeight : 1;
      const delta = Math.max(-120, Math.min(120, event.deltaY * unit));
      if (!delta) return;
      const rect = deck.getBoundingClientRect();
      update(WorkbenchWindowGeometry.zoom(view, Math.exp(-delta * 0.002),
        event.clientX - rect.left, event.clientY - rect.top));
    }, { capture: true, passive: false });
    const reset = () => update({ scale: 1, x: 0, y: 0 });
    button.addEventListener("click", reset);
    render();
    return { surface, reset, reveal, frame, scale: () => view.scale };
  }
  return { create };
})();
