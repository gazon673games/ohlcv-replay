async function startWorkbench() {
  WorkbenchPreferences.init();
  WorkbenchCore.initTabs();
  WorkbenchWorkspace.init();
  WorkbenchChartControls.init();
  WorkbenchStrategyCheck.init();
  WorkbenchTradeUI.init();
  WorkbenchHistoryUI.init();
  WorkbenchChartOverlays.init();
  WorkbenchResearchUI.init();
  WorkbenchCore.setStatus(WorkbenchUX.t("startingApp"), "running");
  try {
    await WorkbenchProxySettings.init();
    await WorkbenchStrategyUI.init();
    await Promise.all([
      WorkbenchDataUI.init(),
      WorkbenchRunUI.init(),
      WorkbenchPortfolioUI.init(),
    ]);
    if (!WorkbenchCore.state.lastError && !WorkbenchMarketData.busy()
        && !WorkbenchCore.state.currentJobId) WorkbenchCore.setStatus(WorkbenchUX.t("ready"), "idle");
  } catch (error) {
    WorkbenchCore.setStatus(`Workbench initialization failed: ${error.message}`, "failed");
  }
}

startWorkbench();
