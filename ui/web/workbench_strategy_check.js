const WorkbenchStrategyCheck = (() => {
  let checking = false;
  let changed = false;
  async function validate(refresh) {
    if (checking) return;
    checking = true;
    changed = false;
    const button = document.getElementById("metadataButton");
    const status = document.getElementById("strategyCheckStatus");
    const source = WorkbenchEditor.getSource();
    button.disabled = true;
    status.textContent = WorkbenchUX.t("checkingStrategy");
    try {
      await refresh();
      status.textContent = WorkbenchUX.t(!changed && source === WorkbenchEditor.getSource() ? "strategyChecked" : "strategyChanged");
    } catch (error) {
      status.textContent = `${WorkbenchUX.t("strategyCheckFailed")}: ${error.message}`;
    } finally { checking = false; button.disabled = false; }
  }
  function init() {
    const clear = () => {
      if (checking) changed = true;
      else document.getElementById("strategyCheckStatus").textContent = "";
    };
    window.addEventListener("workbench-source-change", clear);
    document.getElementById("paramControls").addEventListener("input", clear);
    document.getElementById("strategyLanguage").addEventListener("change", clear);
  }
  return { init, validate };
})();
