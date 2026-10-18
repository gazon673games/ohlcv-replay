const WorkbenchCore = (() => {
  const { escapeHtml } = WorkbenchFormat;
  const state = {
    adapters: [],
    adapter: null,
    dataset: null,
    runDataset: null,
    currentJobId: null,
    runBusy: false,
    lastReport: null,
    lastComparison: null,
    lastResearch: null,
    lastError: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function initTabs() {
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.setAttribute("role", "tab");
      button.setAttribute("aria-controls", button.dataset.view);
      button.id = `tab-${button.dataset.view}`;
      $(button.dataset.view).setAttribute("role", "tabpanel");
      $(button.dataset.view).setAttribute("aria-labelledby", button.id);
      button.addEventListener("click", () => showView(button.dataset.view));
      button.addEventListener("keydown", event => {
        const tabs = [...document.querySelectorAll("[data-view]")];
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const step = event.key === "ArrowLeft" ? -1 : 1;
        const index = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
          : (tabs.indexOf(button) + step + tabs.length) % tabs.length;
        showView(tabs[index].dataset.view);
        tabs[index].focus();
      });
    });
  }

  function showView(viewId) {
    if (!$(viewId)?.classList.contains("result-view")) return;
    if (typeof WorkbenchWindows !== "undefined" && WorkbenchWindows.show(viewId)) {
      $(viewId).classList.add("active");
      $("resultsShell").open = true;
      window.dispatchEvent(new CustomEvent("workbench-view-change", { detail: { viewId } }));
      return;
    }
    $("resultsShell").open = true;
    document.querySelectorAll(".result-view").forEach((view) => {
      view.classList.toggle("active", view.id === viewId);
    });
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === viewId);
      button.setAttribute("aria-selected", String(button.dataset.view === viewId));
      button.tabIndex = button.dataset.view === viewId ? 0 : -1;
    });
    window.dispatchEvent(new CustomEvent("workbench-view-change", { detail: { viewId } }));
  }

  function setStatus(message, status = "idle") {
    $("statusBox").textContent = message;
    $("statusBox").title = message;
    setBadge($("jobBadge"), WorkbenchFeedback.badge(status), status);
  }

  function setBadge(node, text, status) {
    node.textContent = text === status ? WorkbenchFeedback.badge(status) : text;
    node.className = `badge ${status || ""}`.trim();
  }

  function setError(message) {
    state.lastError = message;
    const node = $("dataError");
    if (!node) return;
    node.textContent = message;
    node.classList.remove("hidden");
  }

  function clearError() {
    state.lastError = null;
    const node = $("dataError");
    if (!node) return;
    node.textContent = "";
    node.classList.add("hidden");
  }

  function fillSelect(select, items, preferred) {
    select.innerHTML = (items || [])
      .map((item) => {
        const id = item.id ?? item.value ?? "";
        const name = item.name ?? item.label ?? id;
        return `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
      })
      .join("");
    if (preferred && Array.from(select.options).some((option) => option.value === preferred)) {
      select.value = preferred;
    }
  }

  function optionalNumber(id) {
    const raw = normalizedNumberText($(id).value);
    return raw === "" ? null : finiteNumber(raw, id);
  }

  function requiredNumber(id) {
    const raw = normalizedNumberText($(id).value);
    if (raw === "") throw new Error(`${id} is required`);
    return finiteNumber(raw, id);
  }

  function normalizedNumberText(value) {
    return String(value ?? "").replace(/\s+/gu, "");
  }

  function finiteNumber(raw, id) {
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`${id} must be a number`);
    return value;
  }

  function chartOptions() {
    return {
      tooltip: $("chartTooltip"),
    };
  }

  function parseGrid(text) {
    const grid = {};
    text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
      const separator = line.indexOf("=");
      if (separator < 1) throw new Error(`Invalid grid line: ${line}`);
      const name = line.slice(0, separator).trim();
      const values = line.slice(separator + 1).split(",").map(parseScalar);
      if (!values.length) throw new Error(`Grid parameter has no values: ${name}`);
      grid[name] = values;
    });
    return grid;
  }

  function parseScalar(value) {
    const trimmed = value.trim();
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;
    if (trimmed !== "" && Number.isFinite(Number(trimmed))) return Number(trimmed);
    return trimmed;
  }

  return {
    $,
    chartOptions,
    clearError,
    escapeHtml,
    fillSelect,
    initTabs,
    optionalNumber,
    parseGrid,
    requiredNumber,
    setBadge,
    setError,
    setStatus,
    showView,
    state,
  };
})();
