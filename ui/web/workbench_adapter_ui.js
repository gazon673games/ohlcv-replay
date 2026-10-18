const WorkbenchAdapterUI = (() => {
  const { $, fillSelect } = WorkbenchCore;
  const { t } = WorkbenchI18n;
  let defaultInstrumentMode = "security";

  function applyCapabilities(capabilities, fillValues) {
    defaultInstrumentMode = capabilities.default_instrument_mode || "security";
    fillValues($("instrumentMode"), capabilities.instrument_modes || ["security"]);
    fillValues($("chartTimeframeSelect"), capabilities.timeframes || ["5m"], "5m");
    fillValues($("cachePolicy"), capabilities.cache_policies || ["prefer"], "prefer");
    const cacheLabels = { prefer: "cacheAutomatic", refresh: "cacheRefresh",
      offline: "cacheOffline", only: "cacheOffline", network: "cacheNetwork" };
    for (const option of $("cachePolicy").options) {
      option.textContent = WorkbenchUX.t(cacheLabels[option.value] || option.value);
    }
    const policies = capabilities.archive_fallback_policies || [];
    $("archiveFallbackField")?.classList.toggle("hidden", !policies.length);
    if ($("archiveFallbackPolicy")) fillSelect($("archiveFallbackPolicy"), policies.map(id => ({
      id, name: t(`archivePolicy_${id}`),
    })), capabilities.default_archive_fallback_policy);
    fillValues($("rollRule"), capabilities.roll_rules || []);
    $("cachePolicyField").classList.toggle("hidden", !capabilities.cache_policies?.length);
    $("rollRuleField").classList.toggle("hidden", !capabilities.roll_rules?.length);
    $("rulesArchiveField")?.classList.toggle("hidden", !capabilities.supports_rule_archive);
    if ($("rulesEnforcement")) $("rulesEnforcement").value = capabilities.default_rules_enforcement || "strict";
    if ($("requireQualityGate")) {
      $("requireQualityGate").checked = capabilities.default_quality_approval_required ?? true;
    }
    if ($("qualityModeNote")) $("qualityModeNote").textContent =
      capabilities.default_quality_approval_required === false ? t("researchMode") : "";
    applyExecutionDefaults(capabilities.execution_defaults || {});
    renderLatency(capabilities);
  }

  function renderLatency(capabilities) {
    const lines = [];
    if (capabilities.default_delay_minutes !== null
        && capabilities.default_delay_minutes !== undefined) {
      lines.push(t("delayedData", { minutes: capabilities.default_delay_minutes }));
    }
    if (capabilities.provider_supports_realtime && capabilities.realtime_requires_subscription) {
      lines.push(t("realtimeSubscription"));
    }
    if (!capabilities.adapter_realtime_enabled) lines.push(t("realtimeUnavailable"));
    $("sourceLatency").textContent = lines.join(" ");
  }

  function applyExecutionDefaults(defaults) {
    const neutral = {
      commission_bps: 0, slippage_ticks: 0, bid_ask_spread_ticks: 0,
      execution_timing: "signal_close_to_next_bar_close", trading_days_per_year: "",
    };
    const fields = {
      commission_bps: "commissionBps",
      slippage_ticks: "slippageTicks",
      bid_ask_spread_ticks: "spreadTicks",
      execution_timing: "executionTiming",
      trading_days_per_year: "tradingDaysPerYear",
    };
    Object.entries(fields).forEach(([key, id]) => {
      if ($(id)) $(id).value = defaults[key] ?? neutral[key];
    });
  }

  function setInstrumentMode() {
    const preferred = defaultInstrumentMode;
    if (Array.from($("instrumentMode").options).some((option) => option.value === preferred)) {
      $("instrumentMode").value = preferred;
    }
  }

  function defaultEngine(capabilities) {
    return capabilities.default_engine || "";
  }

  return { applyCapabilities, defaultEngine, renderLatency, setInstrumentMode };
})();
