const WorkbenchProxySettings = (() => {
  const DEFAULT_URL = "localhost:10808";

  async function init() {
    bindControls();
    try {
      const payload = await WorkbenchApi.get("/api/settings/proxy");
      renderAdapters(payload.adapters || []);
      apply(payload.proxy || {});
    } catch (error) {
      setStatus(WorkbenchI18n.t("proxyLoadFailed", { error: error.message }), true);
      apply({ enabled: false, url: DEFAULT_URL, adapter_ids: [], all_adapters: false });
    }
  }

  function bindControls() {
    document.getElementById("proxyEnabled").addEventListener("change", syncDisabled);
    document.getElementById("proxyAllAdapters").addEventListener("change", syncDisabled);
    document.getElementById("proxySaveButton").addEventListener("click", save);
  }

  function renderAdapters(adapters) {
    const container = document.getElementById("proxyAdapterList");
    container.replaceChildren();
    for (const adapter of adapters) {
      const label = document.createElement("label");
      label.className = "check-inline";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.adapterId = adapter.id;
      const name = document.createElement("span");
      name.textContent = adapter.name;
      label.append(input, name);
      container.append(label);
    }
  }

  function apply(settings) {
    document.getElementById("proxyEnabled").checked = Boolean(settings.enabled);
    document.getElementById("proxyUrl").value = settings.url || DEFAULT_URL;
    document.getElementById("proxyAllAdapters").checked = Boolean(settings.all_adapters);
    const selected = new Set(settings.adapter_ids || []);
    for (const input of adapterInputs()) input.checked = selected.has(input.dataset.adapterId);
    syncDisabled();
  }

  function syncDisabled() {
    const enabled = document.getElementById("proxyEnabled").checked;
    const allAdapters = document.getElementById("proxyAllAdapters").checked;
    document.getElementById("proxyUrl").disabled = !enabled;
    document.getElementById("proxyAllAdapters").disabled = !enabled;
    for (const input of adapterInputs()) input.disabled = !enabled || allAdapters;
  }

  async function save() {
    const button = document.getElementById("proxySaveButton");
    button.disabled = true;
    setStatus(WorkbenchI18n.t("proxySaving"));
    try {
      const payload = await WorkbenchApi.post("/api/settings/proxy", currentSettings());
      apply(payload.proxy);
      setStatus(WorkbenchI18n.t("proxySaved"));
    } catch (error) {
      setStatus(WorkbenchI18n.t("proxySaveFailed", { error: error.message }), true);
    } finally {
      button.disabled = false;
    }
  }

  function currentSettings() {
    const allAdapters = document.getElementById("proxyAllAdapters").checked;
    return {
      enabled: document.getElementById("proxyEnabled").checked,
      url: document.getElementById("proxyUrl").value.trim(),
      all_adapters: allAdapters,
      adapter_ids: allAdapters ? [] : adapterInputs()
        .filter((input) => input.checked)
        .map((input) => input.dataset.adapterId),
    };
  }

  function adapterInputs() {
    return [...document.querySelectorAll("#proxyAdapterList input[data-adapter-id]")];
  }

  function setStatus(message, failed = false) {
    const status = document.getElementById("proxyStatus");
    status.textContent = message;
    status.classList.toggle("failed", failed);
  }

  return { apply, currentSettings, init, syncDisabled };
})();
