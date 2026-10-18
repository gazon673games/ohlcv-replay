const WorkbenchWindows = (() => {
  const windows = new Map();
  const storageKey = "workbench.windows.v1";
  let deck, taskbar, viewport, saved = {}, z = 1;
  const words = (ru, en) => document.documentElement.lang === "en" ? en : ru;

  function init(shell) {
    try { saved = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { saved = {}; }
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
    deck = document.createElement("div"); deck.id = "windowDeck";
    taskbar = document.createElement("nav"); taskbar.id = "windowTaskbar";
    taskbar.setAttribute("aria-label", words("Окна", "Windows"));
    shell.append(deck, taskbar); shell.classList.add("floating-workspace");
    viewport = WorkbenchWindowViewport.create(deck, taskbar, () => {
      window.dispatchEvent(new CustomEvent("workbench-before-window-layout", { detail: { id: "strategy" } }));
      windows.forEach(win => { if (win.maximized) apply(win); }); notify();
    });
    window.addEventListener("resize", () => windows.forEach(apply));
  }
  function notify() {
    requestAnimationFrame(() => window.dispatchEvent(new Event("workbench-layout-change")));
  }
  function persist() {
    const data = {};
    windows.forEach((win, id) => { if (win.persistent) data[id] = {
      rect: win.rect, visible: win.visible, maximized: win.maximized }; });
    try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch { /* Storage may be disabled. */ }
  }
  function apply(win) {
    window.dispatchEvent(new CustomEvent("workbench-before-window-layout", { detail: { id: win.id } }));
    win.rect = WorkbenchWindowGeometry.normalize(win.rect);
    const rect = win.maximized ? viewport.frame() : win.rect;
    Object.assign(win.node.style, { left: `${rect.x}px`, top: `${rect.y}px`,
      width: `${rect.width}px`, height: `${rect.height}px` });
    win.node.hidden = !win.visible;
    win.button.classList.toggle("active", win.visible);
    win.button.setAttribute("aria-pressed", String(win.visible));
    win.node.classList.toggle("maximized", win.maximized);
    win.maxButton.setAttribute("aria-label", win.maximized ? words("Восстановить", "Restore") : words("Развернуть", "Maximize"));
    notify();
  }
  function focus(win) { win.node.style.zIndex = String(++z); }
  function show(id) {
    const win = windows.get(id); if (!win) return false;
    win.visible = true; if (!win.maximized) viewport.reveal(win.rect);
    apply(win); focus(win); persist(); return true;
  }
  function hide(id) {
    const win = windows.get(id); if (!win) return;
    win.visible = false; apply(win); persist();
  }
  function maximize(id) {
    const win = windows.get(id); if (!win) return;
    win.visible = true; win.maximized = !win.maximized;
    if (!win.maximized) viewport.reveal(win.rect);
    apply(win); focus(win); persist();
  }
  function remove(id) {
    const win = windows.get(id); if (!win) return;
    win.dispose?.(); win.node.remove(); win.button.remove(); windows.delete(id); persist(); notify();
  }
  function create({ id, title, content, rect, open = false, persistent = true, dispose = null }) {
    if (windows.has(id)) { show(id); return windows.get(id); }
    const stored = persistent ? saved[id] : null;
    const node = document.createElement("section"); node.className = "workbench-window";
    node.dataset.windowId = id; node.setAttribute("role", "region"); node.setAttribute("aria-label", title);
    const header = document.createElement("header"); header.className = "window-titlebar"; header.tabIndex = 0;
    header.title = words("Перетащить · двойной щелчок — развернуть · стрелки — переместить", "Drag · double click to maximize · arrow keys to move");
    const label = document.createElement("strong"); label.textContent = title; header.append(label);
    const control = (text, name, action) => {
      const button = document.createElement("button"); button.type = "button";
      button.textContent = text; button.setAttribute("aria-label", name); button.title = name;
      button.addEventListener("click", action); header.append(button); return button;
    };
    control("—", words("Свернуть", "Minimize"), () => hide(id));
    const maxButton = control("□", words("Развернуть", "Maximize"), () => maximize(id));
    control("×", words("Закрыть", "Close"), () => persistent ? hide(id) : remove(id));
    const body = document.createElement("div"); body.className = "window-body"; body.append(content);
    content.hidden = false;
    const button = document.createElement("button"); button.type = "button"; button.textContent = title;
    button.addEventListener("click", () => show(id));
    const win = { id, node, header, body, label, button, maxButton, dispose, persistent,
      rect: stored?.rect || rect || { x: 40, y: 30, width: 640, height: 460 },
      visible: stored?.visible ?? open, maximized: stored?.maximized === true };
    node.append(header, body); viewport.surface.append(node); taskbar.append(button); windows.set(id, win);
    const corners = { se: ["нижний правый", "bottom right"], sw: ["нижний левый", "bottom left"],
      ne: ["верхний правый", "top right"], nw: ["верхний левый", "top left"] };
    for (const [corner, names] of Object.entries(corners)) {
      const grip = document.createElement("div"); grip.className = "window-resize"; grip.tabIndex = 0;
      grip.dataset.corner = corner; grip.setAttribute("role", "button");
      grip.title = `${words("Изменить размер", "Resize")} (${words(...names)})`;
      grip.setAttribute("aria-label", grip.title); node.append(grip); wireDrag(win, grip, corner);
    }
    node.addEventListener("pointerdown", () => focus(win));
    header.addEventListener("dblclick", event => { if (!event.target.closest("button")) maximize(id); });
    wireDrag(win, header);
    apply(win); if (win.visible) {
      focus(win); if (!win.persistent) viewport.reveal(win.rect);
    }
    return win;
  }
  function wireDrag(win, handle, corner = null) {
    let drag = null;
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0 || event.target.closest("button") || win.maximized) return;
      event.preventDefault(); handle.setPointerCapture(event.pointerId);
      drag = { x: event.clientX, y: event.clientY, rect: { ...win.rect }, scale: viewport.scale() };
      document.body.classList.add("resizing");
    });
    handle.addEventListener("pointermove", event => {
      if (!drag) return;
      const dx = (event.clientX - drag.x) / drag.scale, dy = (event.clientY - drag.y) / drag.scale;
      win.rect = corner ? WorkbenchWindowGeometry.resize(drag.rect, corner, dx, dy)
        : { ...drag.rect, x: drag.rect.x + dx, y: drag.rect.y + dy };
      apply(win);
    });
    const finish = () => { if (!drag) return; drag = null; document.body.classList.remove("resizing"); persist(); };
    handle.addEventListener("pointerup", finish); handle.addEventListener("lostpointercapture", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("keydown", event => {
      if (!event.key.startsWith("Arrow") || win.maximized) return;
      event.preventDefault();
      const dx = event.key === "ArrowLeft" ? -20 : event.key === "ArrowRight" ? 20 : 0;
      const dy = event.key === "ArrowUp" ? -20 : event.key === "ArrowDown" ? 20 : 0;
      if (corner) win.rect = WorkbenchWindowGeometry.resize(win.rect, corner, dx, dy);
      else { win.rect.x += dx; win.rect.y += dy; }
      apply(win); persist();
    });
  }
  function arrange(mode = "tile") {
    const visible = [...windows.values()].filter(win => win.visible);
    const { x, y, width, height } = viewport.frame();
    const rects = WorkbenchWindowGeometry.tile(visible.length, width, height);
    visible.forEach((win, i) => {
      win.maximized = false;
      const rect = mode === "cascade" ? { x: i * 28, y: i * 28,
        width: width * 0.7, height: height * 0.7 } : rects[i];
      win.rect = { ...rect, x: x + rect.x, y: y + rect.y };
      apply(win); focus(win);
    }); persist();
  }
  function get(id) { return windows.get(id); }
  function rename(id, title) {
    const win = get(id); if (!win) return;
    win.label.textContent = title; win.button.textContent = title; win.node.setAttribute("aria-label", title);
  }
  return { init, create, show, hide, maximize, remove, arrange, get, rename, words };
})();
