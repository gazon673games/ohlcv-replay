const WorkbenchChartOverlays = (() => {
  const controls = [
    "showSma",
    "chartSmaPeriod",
    "smaColor",
    "showEma",
    "chartEmaPeriod",
    "emaColor",
    "showBollinger",
    "bollingerPeriod",
    "bollingerStdDev",
    "bollingerColor",
    "showVolume",
    "volumeColor",
    "showInflation",
    "inflationRate",
    "inflationColor",
    "inflationCapitalColor",
    "initialCapital",
  ];
  const serverFeature = {
    showSma: "showSma",
    chartSmaPeriod: "showSma",
    showEma: "showEma",
    chartEmaPeriod: "showEma",
    showBollinger: "showBollinger",
    bollingerPeriod: "showBollinger",
    bollingerStdDev: "showBollinger",
    showInflation: "showInflation",
    inflationRate: "showInflation",
  };
  const colorControls = {
    smaColor: "--indicator-sma", emaColor: "--indicator-ema",
    bollingerColor: "--indicator-bollinger", volumeColor: "--indicator-volume",
    inflationColor: "--indicator-inflation", inflationCapitalColor: "--indicator-capital",
  };
  const persistedControls = controls.filter((id) => id !== "initialCapital" && !(id in colorControls));
  let lastRows = [];
  let reloadTimer = null;

  function init() {
    restorePreferences();
    controls.forEach((id) => {
      const type = document.getElementById(id).type;
      const eventName = type === "color" || type === "number" ? "input" : "change";
      document.getElementById(id).addEventListener(eventName, overlayChanged);
    });
    updateDisabledState();
    updateIndicatorCount();
  }

  function settings() {
    return {
      showSma: document.getElementById("showSma").checked,
      smaPeriod: positiveInteger("chartSmaPeriod", 20),
      smaColor: colorValue("smaColor"),
      showEma: document.getElementById("showEma").checked,
      emaPeriod: positiveInteger("chartEmaPeriod", 20),
      emaColor: colorValue("emaColor"),
      showBollinger: document.getElementById("showBollinger").checked,
      bollingerPeriod: positiveInteger("bollingerPeriod", 20),
      bollingerStdDev: positiveNumber("bollingerStdDev", 2),
      bollingerColor: colorValue("bollingerColor"),
      showVolume: document.getElementById("showVolume").checked,
      volumeColor: colorValue("volumeColor"),
      showInflation: document.getElementById("showInflation").checked,
      inflationRate: finiteNumber("inflationRate", 8),
      inflationColor: colorValue("inflationColor"),
      inflationCapitalColor: colorValue("inflationCapitalColor"),
      initialCapital: positiveNumber("initialCapital", 1_000_000),
      timeframe: document.getElementById("chartTimeframeSelect").value || "5m",
    };
  }

  function appendQuery(query) {
    const current = settings();
    if (current.showSma) query.set("sma_period", String(current.smaPeriod));
    if (current.showEma) query.set("ema_period", String(current.emaPeriod));
    if (current.showBollinger) {
      query.set("bollinger_period", String(current.bollingerPeriod));
      query.set("bollinger_stddev", String(current.bollingerStdDev));
    }
    if (current.showInflation) {
      query.set("inflation_rate", String(current.inflationRate));
      const baseDate = document.getElementById("dataFromDate").value;
      if (baseDate) query.set("inflation_base_ts", `${baseDate}T00:00:00`);
    }
    return query;
  }

  function render(rows) {
    lastRows = rows || [];
    updateIndicatorCount();
    const current = settings();
    WorkbenchMarketChart.setVisualOverlays(lastRows, current);
    const missing = missingIndicators(lastRows, current);
    if (missing.length) {
      const message = WorkbenchI18n.t(
        "indicatorDataUnavailable",
        { names: missing.join(", ") },
      );
      setIndicatorStatus(message, true);
    } else {
      setIndicatorStatus("");
    }
  }

  function reset() {
    lastRows = [];
    WorkbenchMarketChart.setVisualOverlays([], settings());
    setIndicatorStatus("");
  }

  function overlayChanged(event) {
    persistPreferences();
    updateDisabledState();
    updateIndicatorCount();
    const current = settings();
    const enabledKey = serverFeature[event.target.id];
    if (!enabledKey || !current[enabledKey]) {
      render(lastRows);
      return;
    }
    if (reloadTimer !== null) clearTimeout(reloadTimer);
    setIndicatorStatus(WorkbenchI18n.t("indicatorsUpdating"));
    reloadTimer = setTimeout(() => {
      reloadTimer = null;
      Promise.resolve(WorkbenchStreamUI.reloadDataset()).then(reloaded => {
        if (reloaded === false) render(lastRows);
      });
    }, 180);
  }

  function updateDisabledState() {
    document.getElementById("chartSmaPeriod").disabled = !document.getElementById("showSma").checked;
    document.getElementById("chartEmaPeriod").disabled = !document.getElementById("showEma").checked;
    const bollingerDisabled = !document.getElementById("showBollinger").checked;
    document.getElementById("bollingerPeriod").disabled = bollingerDisabled;
    document.getElementById("bollingerStdDev").disabled = bollingerDisabled;
    document.getElementById("inflationRate").disabled = !document.getElementById("showInflation").checked;
  }

  function updateIndicatorCount() {
    const current = settings();
    const count = [
      current.showSma,
      current.showEma,
      current.showBollinger,
      current.showVolume,
      current.showInflation,
    ].filter(Boolean).length;
    document.getElementById("indicatorCount").textContent = String(count);
  }

  function positiveInteger(id, fallback) {
    const value = Math.floor(Number(document.getElementById(id).value));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  function finiteNumber(id, fallback) {
    const value = Number(document.getElementById(id).value);
    return Number.isFinite(value) ? value : fallback;
  }

  function positiveNumber(id, fallback) {
    const value = finiteNumber(id, fallback);
    return value > 0 ? value : fallback;
  }

  function colorValue(id) {
    const value = document.getElementById(id).value;
    return /^#[0-9a-f]{6}$/iu.test(value)
      ? value : WorkbenchChartPrimitives.cssColor(colorControls[id]);
  }

  function setIndicatorStatus(message, failed = false) {
    const element = document.getElementById("indicatorStatus");
    element.textContent = message;
    element.classList.toggle("failed", failed);
  }

  function restorePreferences() {
    const remembered = WorkbenchPreferences.section("indicators");
    const legacyColors = Object.fromEntries(Object.keys(colorControls)
      .filter((id) => /^#[0-9a-f]{6}$/iu.test(remembered[id]))
      .map((id) => [id, remembered[id]]));
    const profiles = WorkbenchPreferences.section("indicatorColors");
    if (Object.keys(legacyColors).length && (!profiles.light || !profiles.dark)) {
      WorkbenchPreferences.updateSection("indicatorColors", {
        light: legacyColors, dark: legacyColors, ...profiles,
      });
    }
    persistedControls.forEach((id) => {
      if (!(id in remembered)) return;
      const element = document.getElementById(id);
      if (element.type === "checkbox") element.checked = remembered[id] === true;
      else if (element.type === "number" && remembered[id] === "") return;
      else element.value = String(remembered[id]);
    });
    applyTheme();
  }

  function applyTheme() {
    const remembered = WorkbenchPreferences.section("indicatorColors")[WorkbenchPreferences.theme()] || {};
    Object.entries(colorControls).forEach(([id, variable]) => {
      document.getElementById(id).value = /^#[0-9a-f]{6}$/iu.test(remembered[id])
        ? remembered[id] : WorkbenchChartPrimitives.cssColor(variable);
    });
    if (lastRows.length) render(lastRows);
  }

  function persistPreferences() {
    const remembered = Object.fromEntries(persistedControls.map((id) => {
      const element = document.getElementById(id);
      return [id, element.type === "checkbox" ? element.checked : element.value];
    }));
    WorkbenchPreferences.updateSection("indicators", remembered);
    const profiles = WorkbenchPreferences.section("indicatorColors");
    profiles[WorkbenchPreferences.theme()] = Object.fromEntries(
      Object.keys(colorControls).map((id) => [id, document.getElementById(id).value]),
    );
    WorkbenchPreferences.updateSection("indicatorColors", profiles);
  }

  function missingIndicators(rows, current) {
    if (!rows.length) return [];
    const checks = [
      [current.showSma, "SMA", "chart_sma"],
      [current.showEma, "EMA", "chart_ema"],
      [current.showBollinger, "Bollinger", "chart_bollinger_middle"],
      [current.showInflation, WorkbenchI18n.t("inflation"), "chart_inflation"],
    ];
    return checks
      .filter(([enabled, _name, column]) => enabled && !rows.some((row) => column in row))
      .map(([_enabled, name]) => name);
  }

  return { appendQuery, applyTheme, init, render, reset, settings };
})();
