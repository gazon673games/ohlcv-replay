async function verifyEmptyWorkspace(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const get = id => document.getElementById(id);
    const check = (value, message) => { if (!value) throw new Error(message); };
    check(!WorkbenchWindows.get("overviewView").visible, "empty results consumed workspace at startup");
    check(!document.querySelector(".primary-chart").classList.contains("has-equity"), "empty equity consumed price space");
    WorkbenchCore.state.dataset = null;
    WorkbenchStreamUI.prepareInstrument(get("instrumentSelect").value);
    get("closePanelButton").click();
    check(!get("chartEmptyState").classList.contains("hidden") && !get("emptyLoadButton").disabled, "empty chart has no direct load action");
    get("emptyChooseButton").click();
    check(WorkbenchWindows.get("data").visible && !get("dataPanel").hidden, "empty chart could not open source selection");
    get("closePanelButton").click();
    get("emptyLoadButton").click();
    await Promise.resolve();
    check(get("emptyLoadButton").disabled, "load action did not guard repeated clicks");
    const deadline = Date.now() + 10000;
    while (WorkbenchMarketData.busy() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    check(WorkbenchMarketChart.stats().candleCount > 0 && get("chartEmptyState").classList.contains("hidden"), "direct action failed to load real cached candles");
    check(!WorkbenchWindows.get("overviewView").visible, "loading data opened empty results");
    WorkbenchWorkspace.openPanel("data");
    return { directLoad: true, sourceSelection: true, emptyResultsCollapsed: true, emptyEquityHidden: true };
  })()`);
}
module.exports = { verifyEmptyWorkspace };
