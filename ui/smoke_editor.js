async function exerciseEditor() {
  const $ = id => document.getElementById(id);
  const check = (value, message) => { if (!value) throw new Error(message); };
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  WorkbenchWorkspace.openPanel("strategy");
  await delay(100);
  const original = WorkbenchEditor.getSource();
  const draft = original + "\n" + Array.from({ length: 100 }, (_, i) => `# editor draft ${i}`).join("\n");
  WorkbenchEditor.setSource(draft);
  const view = WorkbenchEditor.captureView();
  check(view?.monaco, "Monaco editor did not initialize");
  view.monaco.cursorState[0].position = { lineNumber: 75, column: 8 };
  view.monaco.cursorState[0].selectionStart = { lineNumber: 75, column: 8 };
  view.monaco.viewState.firstPosition = { lineNumber: 60, column: 1 };
  view.monaco.viewState.firstPositionDeltaTop = 0;
  WorkbenchEditor.restoreView(view);
  const positioned = WorkbenchEditor.captureView();
  $("monacoEditor").dispatchEvent(new WheelEvent("wheel", { ctrlKey: true, deltaY: 120,
    clientX: 300, clientY: 300, bubbles: true, cancelable: true }));
  await delay(100);
  check(WorkbenchEditor.captureView().monaco.cursorState[0].position.lineNumber
    === positioned.monaco.cursorState[0].position.lineNumber, "workspace zoom moved editor cursor");
  check(WorkbenchEditor.getSource() === draft, "workspace zoom discarded editor draft");
  $("workspaceZoomReset").click();
  await delay(100);
  const dockedWidth = $("monacoEditor").clientWidth;
  const range = WorkbenchMarketChart.getVisibleRange();
  const symbol = $("instrumentSelect").value;
  $("expandEditorButton").click();
  await delay(120);
  const expandedWidth = $("monacoEditor").clientWidth;
  check(expandedWidth > dockedWidth + 300, "expanded editor remained narrow");
  check($("marketChart").clientWidth >= 350, "expanded editor removed the chart context");
  check(WorkbenchEditor.getSource() === draft, "expansion lost the unsaved source");
  WorkbenchWindows.maximize("strategy");
  const beforeResize = $("monacoEditor").clientWidth;
  WorkbenchWindows.get("strategy").node.querySelector(".window-resize")
    .dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
  await delay(100);
  check($("monacoEditor").clientWidth > beforeResize, "editor window could not be resized");
  $("returnChartButton").click();
  await delay(100);
  check(WorkbenchWindows.get("market").visible, "chart window did not restore");
  WorkbenchWorkspace.openPanel("strategy");
  await delay(100);
  const restored = WorkbenchEditor.captureView();
  check(restored.monaco.cursorState[0].position.lineNumber === positioned.monaco.cursorState[0].position.lineNumber, "editor cursor was lost");
  check(restored.monaco.viewState.firstPosition.lineNumber === positioned.monaco.viewState.firstPosition.lineNumber
    && Math.abs(restored.monaco.viewState.firstPositionDeltaTop - positioned.monaco.viewState.firstPositionDeltaTop) <= 2,
  `editor scroll was lost: ${JSON.stringify({ before: positioned.monaco.viewState, after: restored.monaco.viewState })}`);
  check(WorkbenchEditor.getSource() === draft, "returning to editor discarded the draft");
  check($("instrumentSelect").value === symbol && Math.abs(WorkbenchMarketChart.getVisibleRange().from - range.from) < 2, "editor mode changed instrument or chart range");
  WorkbenchCore.showView("tradesView");
  await delay(100);
  check(!$("appShell").classList.contains("editor-expanded"), "results did not restore room for the chart");
  check(WorkbenchEditor.getSource() === draft, "results discarded the draft");
  WorkbenchEditor.setSource(original);
  $("metadataButton").click();
  check($("metadataButton").disabled && $("strategyCheckStatus").textContent, "validation has no busy feedback");
  const deadline = Date.now() + 10000;
  while ($("metadataButton").disabled && Date.now() < deadline) await delay(50);
  check($("strategyCheckStatus").textContent === WorkbenchUX.t("strategyChecked"), "real metadata validation failed");
  return { dockedWidth, expandedWidth, expandedResizable: true, draftPreserved: true, cursorPreserved: true, scrollPreserved: true, realValidation: true };
}
module.exports = { exerciseEditor };
