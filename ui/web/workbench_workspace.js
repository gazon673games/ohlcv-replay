const WorkbenchWorkspace = (() => {
  const { $ } = WorkbenchCore;
  const views = ["overviewView", "tradesView", "actionsView", "chartsView", "researchView", "jobsView"];
  const titles = {};
  let lastPanel = "data", focused = false;
  let editorView = null;

  function init() {
    const shell = $("appShell");
    const tabs = document.querySelector(".result-tabs");
    document.querySelector(".layout-tools").append(tabs);
    $("closeResultsButton").hidden = true;
    WorkbenchWindows.init(shell);
    const width = shell.clientWidth, height = shell.clientHeight - 34;
    WorkbenchWindows.create({ id: "market", title: WorkbenchWindows.words("График", "Chart"),
      content: document.querySelector(".market-stage"), open: true,
      rect: { x: 0, y: 0, width: width * 0.67, height } });
    for (const panel of ["data", "strategy"]) {
      WorkbenchWindows.create({ id: panel, title: WorkbenchUX.t(`${panel}Panel`),
        content: $(`${panel}Panel`), open: panel === "data",
        rect: { x: width * 0.67, y: 0, width: width * 0.33, height } });
    }
    views.forEach((id, index) => {
      titles[id] = document.querySelector(`[data-view="${id}"]`);
      WorkbenchWindows.create({ id, title: titles[id].textContent, content: $(id),
        rect: { x: 30 + index * 20, y: 45 + index * 15, width: width * 0.68, height: height * 0.7 } });
    });
    document.querySelectorAll("[data-panel]").forEach(button => button.addEventListener("click", () => openPanel(button.dataset.panel)));
    $("focusChartButton").addEventListener("click", toggleFocus);
    $("expandEditorButton").addEventListener("click", toggleEditor);
    $("closePanelButton").addEventListener("click", () => WorkbenchWindows.hide(lastPanel));
    $("returnChartButton").addEventListener("click", () => WorkbenchWindows.show("market"));
    $("closeResultsButton").addEventListener("click", () => views.forEach(WorkbenchWindows.hide));
    $("emptyChooseButton").addEventListener("click", () => openPanel("data"));
    $("emptyLoadButton").addEventListener("click", () => {
      if (!$("instrumentSelect").value) openPanel("data"); else $("buildDatasetButton").click();
    });
    const syncLoad = () => { $("emptyLoadButton").disabled = $("buildDatasetButton").disabled; };
    new MutationObserver(syncLoad).observe($("buildDatasetButton"), { attributes: true, attributeFilter: ["disabled"] });
    syncLoad();
    $("emptyStrategyButton").addEventListener("click", () => openPanel("strategy"));
    $("emptyHistoryButton").addEventListener("click", () => WorkbenchCore.showView("jobsView"));
    $("marketTitle").addEventListener("click", () => openPanel("data"));
    $("portfolioWindowButton").addEventListener("click", () => WorkbenchWindows.show("portfolio"));
    $("newChartWindowButton").addEventListener("click", () => WorkbenchMultiChart.open());
    $("tileWindowsButton").addEventListener("click", () => WorkbenchWindows.arrange());
    $("cascadeWindowsButton").addEventListener("click", () => WorkbenchWindows.arrange("cascade"));
    window.addEventListener("workbench-preferences-change", translate);
    window.addEventListener("workbench-before-window-layout", event => {
      if (event.detail.id === "strategy") editorView = WorkbenchEditor.captureView();
    });
    window.addEventListener("workbench-layout-change", () => WorkbenchEditor.restoreView(editorView));
    document.addEventListener("keydown", keydown);
    translate();
  }
  function openPanel(panel) {
    if (!["data", "strategy"].includes(panel)) return;
    lastPanel = panel; WorkbenchWindows.show(panel);
  }
  function toggleEditor() { openPanel("strategy"); WorkbenchWindows.maximize("strategy"); }
  function toggleFocus() { focused = !focused; WorkbenchWindows.maximize("market"); }
  function translate() {
    WorkbenchUX.apply();
    const words = WorkbenchWindows.words;
    for (const [id, ru, en] of [["portfolioWindowButton", "Портфель", "Portfolio"], ["newChartWindowButton", "+ График", "+ Chart"],
      ["tileWindowsButton", "Плитка", "Tile"], ["cascadeWindowsButton", "Каскад", "Cascade"]]) $(id).textContent = words(ru, en);
    WorkbenchWindows.rename("market", words("График", "Chart"));
    for (const panel of ["data", "strategy"]) WorkbenchWindows.rename(panel, WorkbenchUX.t(`${panel}Panel`));
    views.forEach(id => WorkbenchWindows.rename(id, titles[id].textContent));
  }
  function keydown(event) {
    if (event.defaultPrevented) return;
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "e") {
      event.preventDefault(); toggleEditor(); return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault(); if (!WorkbenchCore.state.currentJobId) $("runButton").click(); return;
    }
    if (event.target.closest?.("input, textarea, select, [contenteditable=true], .monaco-editor")) return;
    if (event.altKey && ["1", "2", "3", "Enter"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "1") openPanel("data");
      if (event.key === "2") openPanel("strategy");
      if (event.key === "3") WorkbenchCore.showView("tradesView");
      if (event.key === "Enter") toggleFocus();
    }
    if (event.key === "Escape") {
      document.querySelectorAll(".settings-menu, .indicator-menu, .shortcut-menu").forEach(menu => { menu.open = false; });
      if (focused) toggleFocus();
    }
  }
  return { init, openPanel, toggleEditor, toggleFocus };
})();
