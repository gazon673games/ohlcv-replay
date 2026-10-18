async function waitForServer(port) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      const payload = await response.json();
      if (response.ok && payload.service === "ohlcv-replay-workbench"
          && payload.status === "ready") return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("smoke server did not start");
}

async function waitForInstrumentSelector(window) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(
      `Boolean(document.getElementById("instrumentSelect")?.value && document.getElementById("dataFromDate").value
        && document.getElementById("dataTillDate").value
        && (!document.getElementById("buildDatasetButton").disabled || WorkbenchMarketData.busy()))`,
    );
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("instrument selector did not finish loading");
}

async function waitForAutomaticMarket(window) {
  const result = await window.webContents.executeJavaScript(`(async () => {
    const get = id => document.getElementById(id);
    const originalPost = WorkbenchApi.post;
    let downloads = 0;
    WorkbenchApi.post = async (url, body) => {
      if (url === "/api/datasets/build/async") downloads++;
      return originalPost(url, body);
    };
    try {
      get("dataFromDate").value = "2026-07-01";
      get("dataTillDate").value = "2026-07-02";
      get("dataTillDate").dispatchEvent(new Event("change"));
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        if (!WorkbenchMarketData.busy() && !WorkbenchCore.state.currentJobId
            && WorkbenchCore.state.dataset && WorkbenchMarketChart.stats().candleCount) {
          if (downloads) throw new Error("covered CNY period triggered a candle download");
          return { symbol: get("instrumentSelect").value,
            candles: WorkbenchMarketChart.stats().candleCount, downloads };
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error("automatic market selection did not finish: " + JSON.stringify({ status: get("statusBox").textContent,
        busy: WorkbenchMarketData.busy(), job: WorkbenchCore.state.currentJobId, dataset: WorkbenchCore.state.dataset?.dataset_id,
        from: get("dataFromDate").value, till: get("dataTillDate").value, instrument: get("instrumentSelect").value,
        loadDisabled: get("buildDatasetButton").disabled, candles: WorkbenchMarketChart.stats().candleCount }));
    } finally { WorkbenchApi.post = originalPost; }
  })()`);
  process.stdout.write(`automatic saved market loaded: ${JSON.stringify(result)}\n`);
}

module.exports = { waitForAutomaticMarket, waitForInstrumentSelector, waitForServer };
