const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const css = fs.readFileSync("web/style.css", "utf8");
const grimdark = fs.readFileSync("web/theme_grimdark.css", "utf8");
function variables(source) {
  return Object.fromEntries(Array.from(source.matchAll(/(--[\w-]+):\s*([^;]+);/gu),
    (match) => [match[1], match[2].trim()]));
}
const base = variables(css.split(':root[data-theme="dark"]')[0]);
const paint = variables(grimdark.split("\n}\n")[0]);
let cookie = `ohlcv_replay_preferences_v1=${encodeURIComponent(JSON.stringify({
  locale: "ru", theme: "dark", indicators: { smaColor: "#123456", chartSmaPeriod: "37" },
}))}`;
const storage = new Map();
const rendered = [];
let editorTheme;

function session() {
  const elements = new Map();
  const document = {
    documentElement: { dataset: {} },
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          id, type: id.startsWith("show") ? "checkbox" : id.endsWith("Color") ? "color" : "text",
          value: id === "initialCapital" ? "1000000" : "20", checked: false, listeners: {},
          classList: { toggle() {} },
          addEventListener(event, callback) { this.listeners[event] = callback; },
        });
      }
      return elements.get(id);
    },
    get cookie() { return cookie; },
    set cookie(value) { cookie = value.split(";")[0]; },
  };
  const context = vm.createContext({
    document, console,
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    CustomEvent: class { constructor(type, values) { this.type = type; this.detail = values.detail; } },
    window: { dispatchEvent(event) {
      if (event.type === "workbench-preferences-change") context.overlays.applyTheme();
    } },
    WorkbenchI18n: { apply() {}, t: (key) => key },
    WorkbenchMarketChart: { setVisualOverlays: (_rows, settings) => rendered.push(settings) },
    monaco: { editor: { defineTheme: (_name, theme) => { editorTheme = theme; } } },
    getComputedStyle: () => ({ getPropertyValue(name) {
      const values = document.documentElement.dataset.theme === "grimdark" ? { ...base, ...paint } : base;
      let value = values[name] || "";
      while (value.startsWith("var(")) value = values[value.slice(4, -1)] || "";
      return value;
    } }),
  });
  vm.runInContext([
    "workbench_preferences.js", "workbench_chart_primitives.js", "workbench_chart_overlays.js",
    "workbench_editor_theme.js",
  ].map((name) => fs.readFileSync(`web/${name}`, "utf8")).join("\n"), context);
  vm.runInContext(`globalThis.preferences = WorkbenchPreferences;
    globalThis.overlays = WorkbenchChartOverlays; globalThis.editorTheme = WorkbenchEditorTheme;`, context);
  context.preferences.init();
  context.overlays.init();
  return { context, elements };
}

let current = session();
assert.equal(current.elements.get("smaColor").value, "#123456", "legacy indicator color is restored");
assert.equal(current.elements.get("chartSmaPeriod").value, "37");
function selectTheme(theme) {
  const select = current.elements.get("themeSelect");
  select.value = theme;
  select.listeners.change();
}
selectTheme("grimdark");
assert.equal(current.context.preferences.theme(), "grimdark");
assert.equal(current.elements.get("smaColor").value, "#F6E2BD");
assert.equal(current.context.editorTheme.name(), "grimdark");
assert.equal(editorTheme.colors["editor.background"], "#21252C");
assert.equal(editorTheme.colors["editor.foreground"], "#F6E2BD");
current.context.overlays.render([{ ts: "2026-10-01", close: 10 }]);
const color = current.elements.get("smaColor");
color.value = "#F0B81D";
color.listeners.input({ target: color });
selectTheme("dark");
assert.equal(current.elements.get("smaColor").value, "#123456");
assert.equal(current.context.editorTheme.name(), "vs-dark");
selectTheme("grimdark");
assert.equal(current.elements.get("smaColor").value, "#F0B81D");
assert.equal(rendered.at(-1).smaColor, "#F0B81D", "visible overlays follow the selected theme");
current = session();
assert.equal(current.context.preferences.theme(), "grimdark", "theme survives a reload");
assert.equal(current.elements.get("smaColor").value, "#F0B81D", "custom theme color survives a reload");
assert.equal(current.elements.get("chartSmaPeriod").value, "37");
selectTheme("light");
assert.equal(current.elements.get("smaColor").value, "#123456");
assert.equal(current.context.editorTheme.name(), "vs");
console.log("theme switching, editor, and indicator preference tests passed");
