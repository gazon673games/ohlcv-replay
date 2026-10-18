const WorkbenchEditorTheme = (() => {
  function define() {
    const color = (name) => getComputedStyle(document.documentElement)
      .getPropertyValue(`--paint-${name}`).trim();
    const token = (name) => color(name).slice(1);
    monaco.editor.defineTheme("grimdark", {
      base: "vs-dark",
      inherit: false,
      rules: [
        { token: "", foreground: token("ivory-white") },
        { token: "comment", foreground: token("ivory-white"), fontStyle: "italic" },
        { token: "keyword", foreground: token("moonbeam-yellow") },
        { token: "number", foreground: token("moonbeam-yellow") },
        { token: "string", foreground: token("ivory-white") },
        { token: "delimiter", foreground: token("moonbeam-yellow") },
        { token: "type.identifier", foreground: token("moonbeam-yellow") },
      ],
      colors: {
        "editor.background": color("darkness"),
        "editor.foreground": color("ivory-white"),
        "editorCursor.foreground": color("moonbeam-yellow"),
        "editorLineNumber.foreground": `${color("ivory-white")}99`,
        "editorLineNumber.activeForeground": color("moonbeam-yellow"),
        "editor.lineHighlightBackground": color("ironclad-grey"),
        "editor.selectionBackground": color("turnbull-turquoise"),
        "editor.inactiveSelectionBackground": color("grimdark-shadow"),
        "editor.selectionHighlightBackground": color("voodoo-shade"),
        "editorIndentGuide.background1": color("heavy-metal"),
        "editorIndentGuide.activeBackground1": color("warm-skin-shade"),
        "editorWhitespace.foreground": color("heavy-metal"),
        "editorBracketMatch.background": color("emperor-gold"),
        "editorBracketMatch.border": color("moonbeam-yellow"),
        "editorBracketHighlight.foreground1": color("moonbeam-yellow"),
        "editorBracketHighlight.foreground2": color("ivory-white"),
        "editorBracketHighlight.foreground3": color("moonbeam-yellow"),
        "editorBracketHighlight.foreground4": color("ivory-white"),
        "editorBracketHighlight.foreground5": color("moonbeam-yellow"),
        "editorBracketHighlight.foreground6": color("ivory-white"),
        "editorBracketHighlight.unexpectedBracket.foreground": color("bloodmoon-red"),
        "editor.findMatchBackground": color("emperor-gold"),
        "editor.findMatchHighlightBackground": color("voodoo-shade"),
        "editor.wordHighlightBackground": color("voodoo-shade"),
        "editor.wordHighlightStrongBackground": color("emperor-gold"),
        "editorError.foreground": color("bloodmoon-red"),
        "editorWarning.foreground": color("moonbeam-yellow"),
        "editorInfo.foreground": color("ivory-white"),
        "editorWidget.background": color("banshee-brown"),
        "editorWidget.foreground": color("ivory-white"),
        "editorWidget.border": color("warm-skin-shade"),
        "textLink.foreground": color("moonbeam-yellow"),
        "textLink.activeForeground": color("ivory-white"),
        "editorGutter.addedBackground": color("tainted-garden"),
        "editorGutter.deletedBackground": color("fiery-vermilion"),
        "editorGutter.modifiedBackground": color("turnbull-turquoise"),
        "editorSuggestWidget.background": color("banshee-brown"),
        "editorSuggestWidget.foreground": color("ivory-white"),
        "editorSuggestWidget.border": color("warm-skin-shade"),
        "editorSuggestWidget.selectedBackground": color("voodoo-shade"),
        "editorSuggestWidget.highlightForeground": color("moonbeam-yellow"),
        "editorHoverWidget.background": color("grim-rust"),
        "editorHoverWidget.foreground": color("ivory-white"),
        "editorHoverWidget.border": color("voodoo-shade"),
        "input.background": color("darkness"),
        "input.foreground": color("ivory-white"),
        "input.border": color("warm-skin-shade"),
        "focusBorder": color("moonbeam-yellow"),
        "list.activeSelectionBackground": color("turnbull-turquoise"),
        "list.activeSelectionForeground": color("ivory-white"),
        "list.hoverBackground": color("midnight-olive"),
        "scrollbarSlider.background": color("grimdark-shadow"),
        "scrollbarSlider.hoverBackground": color("voodoo-shade"),
        "scrollbarSlider.activeBackground": color("warm-skin-shade"),
      },
    });
  }

  function name() {
    const theme = WorkbenchPreferences.theme();
    if (theme === "grimdark") {
      define();
      return "grimdark";
    }
    return theme === "dark" ? "vs-dark" : "vs";
  }

  return { name };
})();
