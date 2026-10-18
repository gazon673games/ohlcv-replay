const WorkbenchStrategyUI = (() => {
  const { $, escapeHtml, fillSelect, setStatus } = WorkbenchCore;
  const { t } = WorkbenchI18n;
  let activeMetadata = null;
  let activeStrategyId = null;
  let catalogEdit = null;
  let selectionVersion = 0;

  const defaultSource = `"""Blank callback for contract checks; it never submits a trading signal."""

from strategy_sdk import DataRequirements, ParameterSpec, StrategyMetadata, hold_decision

STRATEGY_METADATA = StrategyMetadata(
    "new_strategy",
    params=(
        ParameterSpec("timeframe", "str", default="M5"),
        ParameterSpec("timezone", "str", default="UTC"),
    ),
)


def data_requirements(params):
    return DataRequirements(params["timeframe"], 1, timezone=params["timezone"])


def generate_signal(ctx, params):
    return hold_decision(reason="no_signal")
`;

  async function init() {
    WorkbenchEditor.init(defaultSource, "python");
    wireEvents();
    await loadStrategies();
    await refreshMetadata();
    setInterval(() => loadStrategies($("strategySelect").value), 10000);
  }

  function wireEvents() {
    $("strategyLanguage").addEventListener("change", () => {
      const language = $("strategyLanguage").value;
      WorkbenchEditor.setLanguage(language);
      $("downloadSdkSourceButton").hidden = language !== "python";
      if (language !== "python") {
        catalogEdit = null;
        $("sdkSourceFiles").hidden = true;
        $("saveSdkSourceButton").hidden = true;
      }
    });
    $("metadataButton").addEventListener("click", () => WorkbenchStrategyCheck.validate(refreshMetadata));
    $("saveStrategyButton").addEventListener("click", saveStrategy);
    $("saveSdkSourceButton").addEventListener("click", saveCatalogSource);
    $("sdkSourceFile").addEventListener("change", switchSourceFile);
    $("downloadSdkSourceButton").addEventListener("click", downloadSource);
    $("newStrategyButton").addEventListener("click", startNewStrategy);
    $("loadStrategyButton").addEventListener("click", loadSelectedStrategy);
    $("paramControls").addEventListener("input", renderContractSummary);
    $("strategySelect").addEventListener("change", () => {
      if ($("strategySelect").value) return loadSelectedStrategy();
      else startNewStrategy();
    });
    document.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveStrategy();
      }
    });
  }

  async function loadStrategies(preferred) {
    const before = $("strategySelect").value;
    const payload = await WorkbenchApi.safeGet("/api/strategies", { items: [] });
    const selected = $("strategySelect").value !== before
      ? $("strategySelect").value : preferred || before;
    const options = (payload.items || []).map((item) => ({ id: item.id, name: item.name }));
    options.unshift({ id: "", name: t("newStrategy") });
    fillSelect($("strategySelect"), options, selected);
    $("strategySelect").value = selected || "";
    $("sdkCatalogError").textContent = payload.catalog_error || "";
  }

  async function loadSelectedStrategy() {
    const id = $("strategySelect").value;
    if (!id) return;
    const version = ++selectionVersion;
    try {
      const strategy = await WorkbenchApi.get(`/api/strategies/${encodeURIComponent(id)}`);
      if (version !== selectionVersion) return;
      catalogEdit = strategy.sdk_editor || null;
      $("saveSdkSourceButton").hidden = !catalogEdit?.id;
      $("sdkSourceFiles").hidden = !catalogEdit;
      $("downloadSdkSourceButton").hidden = strategy.language !== "python";
      if (catalogEdit) {
        fillSelect($("sdkSourceFile"), Object.keys(catalogEdit.snapshot.files)
          .map(name => ({ id: name, name: name + ".py" })), catalogEdit.module);
        $("sdkSourceFile").value = catalogEdit.module;
        $("sdkSourceLocation").textContent = catalogEdit.id ? catalogEdit.location : t("pinnedSdkCode");
      }
      activeStrategyId = strategy.origin === "sdk-catalog" ? null : strategy.id || id;
      $("strategyName").value = strategy.name || id;
      $("strategyTags").value = (strategy.tags || []).join(",");
      WorkbenchEditor.setLanguage(strategy.language || "javascript");
      WorkbenchEditor.setSource(strategy.editor_source ?? strategy.source ?? "");
      await refreshMetadata(strategy.params || {});
      if (version !== selectionVersion) return;
      setStatus(`Loaded strategy: ${strategy.name}`, "idle");
    } catch (error) {
      setStatus(`Strategy load failed: ${error.message}`, "failed");
    }
  }

  function startNewStrategy() {
    selectionVersion++;
    if (catalogEdit) {
      sourceForRun();
      catalogEdit.id = null;
      $("sdkSourceLocation").textContent = t("localStrategyCopy");
    }
    $("saveSdkSourceButton").hidden = true;
    $("downloadSdkSourceButton").hidden = WorkbenchEditor.getLanguage() !== "python";
    activeStrategyId = null;
    $("strategySelect").value = "";
    setStatus(t("newStrategy"), "idle");
  }

  async function saveStrategy() {
    const version = selectionVersion;
    try {
      await refreshMetadata();
      if (version !== selectionVersion) return;
      const currentParams = collectParams();
      const payload = await WorkbenchApi.post("/api/strategies", {
        id: activeStrategyId,
        name: $("strategyName").value,
        tags: $("strategyTags").value.split(",").map((item) => item.trim()).filter(Boolean),
        source: sourceForRun(),
        language: WorkbenchEditor.getLanguage(),
        params: currentParams,
      });
      if (version !== selectionVersion) return;
      activeMetadata = payload.strategy.metadata || null;
      activeStrategyId = payload.strategy.id;
      renderMetadata(activeMetadata, payload.strategy.params || currentParams);
      await loadStrategies(payload.strategy.id);
      setStatus(`Saved strategy: ${payload.strategy.name} v${payload.strategy.version}`, "completed");
    } catch (error) {
      setStatus(`Strategy save failed: ${error.message}`, "failed");
    }
  }

  async function refreshMetadata(preferredParams) {
    const currentParams = preferredParams === undefined ? collectParams() : preferredParams;
    const version = selectionVersion;
    try {
      const payload = await WorkbenchApi.post("/api/strategy-metadata", {
        source: sourceForRun(),
        language: WorkbenchEditor.getLanguage(),
        params: currentParams,
      });
      if (version !== selectionVersion) return activeMetadata;
      activeMetadata = payload.metadata || null;
      // Editing parameters while validation is in flight must not restore the submitted draft.
      renderMetadata(activeMetadata, preferredParams === undefined ? collectParams() : currentParams);
      return activeMetadata;
    } catch (error) {
      if (version !== selectionVersion) return activeMetadata;
      setStatus(`Strategy metadata failed: ${error.message}`, "failed");
      throw error;
    }
  }

  function renderMetadata(metadata, preferredParams = {}) {
    renderParamControls(metadata || {}, preferredParams);
    renderContractSummary();
    if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
      window.dispatchEvent(new Event("workbench-strategy-contract-change"));
    }
  }

  function renderContractSummary() {
    const metadata = activeMetadata;
    const values = WorkbenchStrategyParams.resolve(metadata?.params || [], collectParams());
    const times = metadata?.decision_time_param
      ? [values[metadata.decision_time_param]]
      : metadata?.decision_times || [];
    $("strategyContractSummary").textContent = metadata
      ? [metadata.timeframe, metadata.schedule === "times" ? times.join(", ") : metadata.schedule]
        .filter(Boolean)
        .join(" | ")
      : "invalid contract";
    $("strategyContractSummary").className = `badge ${metadata ? "approved" : "rejected"}`;
  }

  function renderParamControls(metadata, preferredParams) {
    const params = metadata.params || [];
    const values = WorkbenchStrategyParams.resolve(params, preferredParams);
    $("paramControls").innerHTML = params.length
      ? params.map((param) => paramInput(param, values[param.name])).join("")
      : `<span class="badge">${escapeHtml(t("noParameters"))}</span>`;
  }

  function paramInput(param, value) {
    const type = param.param_type === "bool" ? "checkbox" : "text";
    const checked = type === "checkbox" && WorkbenchStrategyParams.checked(value)
      ? " checked"
      : "";
    const valueAttr = type === "checkbox" ? "" : ` value="${escapeHtml(value)}"`;
    return `<label>${escapeHtml(param.name)}<input type="${type}" data-param="${escapeHtml(param.name)}"${valueAttr}${checked} /></label>`;
  }

  function collectParams() {
    return WorkbenchStrategyParams.collect(document.querySelectorAll("[data-param]"));
  }

  function timeframe() {
    return activeMetadata?.timeframe || "5m";
  }

  function sourceForRun() {
    if (!catalogEdit) return WorkbenchEditor.getSource();
    catalogEdit.snapshot.files[catalogEdit.module] = WorkbenchEditor.getSource();
    return "SDK_CATALOG_SNAPSHOT = " + pythonLiteral(catalogEdit.snapshot) + "\n";
  }

  function pythonLiteral(value) {
    if (value === null) return "None";
    if (typeof value === "boolean") return value ? "True" : "False";
    if (Array.isArray(value)) return "[" + value.map(pythonLiteral).join(", ") + "]";
    if (typeof value === "object") return "{" + Object.entries(value)
      .map(([key, item]) => JSON.stringify(key) + ": " + pythonLiteral(item)).join(", ") + "}";
    return JSON.stringify(value);
  }

  function switchSourceFile() {
    if (!catalogEdit) return;
    catalogEdit.snapshot.files[catalogEdit.module] = WorkbenchEditor.getSource();
    catalogEdit.module = $("sdkSourceFile").value;
    WorkbenchEditor.setSource(catalogEdit.snapshot.files[catalogEdit.module]);
  }

  function downloadSource() {
    const blob = new Blob([WorkbenchEditor.getSource()], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (catalogEdit?.module || "my_strategy") + ".py";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function saveCatalogSource() {
    if (!catalogEdit?.id) return;
    const edit = catalogEdit;
    const module = edit.module;
    const code = WorkbenchEditor.getSource();
    $("saveSdkSourceButton").disabled = true;
    try {
      const saved = await WorkbenchApi.post("/api/sdk-source/save", {
        id: edit.id, filename: module + ".py", revision: edit.revisions[module], source: code, params: collectParams(),
      });
      edit.revisions[module] = saved.revision;
      if (catalogEdit !== edit) return;
      const message = WorkbenchEditor.getSource() === code
        ? `Saved common SDK file: ${saved.filename}. Existing runs keep their snapshots.`
        : `Saved common SDK file: ${saved.filename}. The editor contains newer unsaved changes.`;
      setStatus(message, "completed");
    } catch (error) {
      if (catalogEdit === edit) setStatus(`SDK source save failed: ${error.message}`, "failed");
    }
    finally { $("saveSdkSourceButton").disabled = false; }
  }

  return { collectParams, init, refreshMetadata, sourceForRun, timeframe };
})();
