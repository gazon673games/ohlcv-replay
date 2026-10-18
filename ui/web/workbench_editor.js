const WorkbenchEditor = (() => {
  let editor = null;
  let fallback = null;
  let source = "";
  let language = "javascript";
  let preservedView = null;

  function init(initialSource, initialLanguage = "javascript") {
    setLanguage(initialLanguage);
    source = initialSource;
    fallback = document.getElementById("scriptInput");
    fallback.value = source;
    fallback.addEventListener("input", () => window.dispatchEvent(new Event("workbench-source-change")));
    if (!window.require) return;
    window.require.config({
      paths: { vs: "/vendor/monaco/vs" },
    });
    window.require(["vs/editor/editor.main"], async () => {
      const dts = await fetch("/strategy.d.ts").then((response) => response.text());
      monaco.languages.typescript.javascriptDefaults.addExtraLib(dts, "strategy.d.ts");
      editor = monaco.editor.create(document.getElementById("monacoEditor"), {
        value: source,
        language,
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        theme: WorkbenchEditorTheme.name(),
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        document.getElementById("runButton").click();
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE,
        () => WorkbenchWorkspace.toggleEditor());
      editor.onDidChangeModelContent(() => window.dispatchEvent(new Event("workbench-source-change")));
      fallback.classList.add("hidden");
    });
  }

  function getSource() {
    return editor ? editor.getValue() : fallback.value;
  }

  function setSource(nextSource) {
    source = nextSource || "";
    if (editor) editor.setValue(source);
    if (fallback) fallback.value = source;
  }

  function getLanguage() { return language; }

  function setLanguage(value) {
    language = value;
    document.getElementById("strategyLanguage").value = value;
    if (editor) monaco.editor.setModelLanguage(editor.getModel(), value);
  }

  function applyTheme() {
    if (window.monaco) {
      monaco.editor.setTheme(WorkbenchEditorTheme.name());
    }
  }

  function captureView() {
    if (editor) {
      if (editor.getDomNode().clientWidth) preservedView = { monaco: editor.saveViewState(), revision: editor.getModel().getVersionId() };
      return preservedView;
    }
    return fallback ? { start: fallback.selectionStart, end: fallback.selectionEnd, scroll: fallback.scrollTop } : null;
  }

  function restoreView(view) {
    if (editor) {
      editor.layout();
      if (editor.getDomNode().clientWidth && view?.monaco && view.revision === editor.getModel().getVersionId()) {
        editor.restoreViewState(view.monaco);
      }
    } else if (fallback && view) {
      fallback.setSelectionRange(view.start, view.end);
      fallback.scrollTop = view.scroll;
    }
  }

  return { applyTheme, captureView, restoreView, getLanguage, getSource, init, setLanguage, setSource };
})();
