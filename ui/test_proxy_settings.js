const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class ElementStub {
  constructor() {
    this.children = [];
    this.dataset = {};
    this.classList = { toggle: (name, active) => { this.failed = name === "failed" && active; } };
    this.listeners = {};
    this.value = "";
    this.checked = false;
    this.disabled = false;
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren() {
    this.children = [];
  }
}

const elements = Object.fromEntries([
  "proxyEnabled",
  "proxyUrl",
  "proxyAllAdapters",
  "proxySaveButton",
  "proxyStatus",
  "proxyAdapterList",
].map((id) => [id, new ElementStub()]));
let posted;
const document = {
  getElementById: (id) => elements[id],
  createElement: () => new ElementStub(),
  querySelectorAll: () => elements.proxyAdapterList.children.map((label) => label.children[0]),
};
const context = vm.createContext({
  document,
  WorkbenchApi: {
    get: async () => ({
      adapters: [{ id: "moex", name: "MOEX ISS" }, { id: "binance", name: "Binance" }],
      proxy: {
        enabled: true,
        url: "localhost:10808",
        adapter_ids: ["binance"],
        all_adapters: false,
      },
    }),
    post: async (_url, payload) => {
      posted = payload;
      return { proxy: payload };
    },
  },
  WorkbenchI18n: { t: (key) => key },
});
const source = fs.readFileSync(
  path.join(__dirname, "web", "workbench_proxy_settings.js"),
  "utf8",
);
vm.runInContext(`${source}\nglobalThis.subject = WorkbenchProxySettings;`, context);

(async () => {
  await context.subject.init();
  const adapterInputs = document.querySelectorAll();
  assert.equal(elements.proxyEnabled.checked, true);
  assert.equal(elements.proxyUrl.value, "localhost:10808");
  assert.equal(adapterInputs[0].checked, false);
  assert.equal(adapterInputs[1].checked, true);

  elements.proxyAllAdapters.checked = true;
  context.subject.syncDisabled();
  assert.equal(adapterInputs.every((input) => input.disabled), true);
  await elements.proxySaveButton.listeners.click();
  assert.equal(JSON.stringify(posted), JSON.stringify({
    enabled: true,
    url: "localhost:10808",
    all_adapters: true,
    adapter_ids: [],
  }));
  assert.equal(elements.proxyStatus.textContent, "proxySaved");
  process.stdout.write("proxy settings UI tests passed\n");
})().catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
