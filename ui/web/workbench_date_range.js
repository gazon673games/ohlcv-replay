const WorkbenchDateRange = (() => {
  const { $, setStatus } = WorkbenchCore;
  const { t } = WorkbenchI18n;
  let options = null;
  let autoDates = false;
  let assigned = null;

  function init(configuration) {
    options = configuration;
    ["dataFromDate", "dataTillDate"].forEach((id) => {
      $(id).addEventListener("change", (event) => {
        freeze();
        refresh(event.target.id, true);
        options.onChange();
      });
    });
    window.addEventListener("workbench-preferences-change", () => refresh());
  }

  function resetAutoRange() { autoDates = true; assigned = null; }
  function freeze() { autoDates = false; }

  function refresh(editedId = "", notify = false) {
    if (!options) return { changed: false };
    const remote = options.remoteRange?.();
    const saved = options.localRange?.();
    const limits = remote?.status === "ready"
      ? { min: remote.range.from_date, max: remote.range.till_date }
      : WorkbenchDataHelpers.dateRangeLimits(options.datasets(), {
        ...WorkbenchDataHelpers.marketSelection($), sourceTimeframe: options.sourceTimeframe(),
      });
    const from = $("dataFromDate");
    const till = $("dataTillDate");
    if (assigned && (from.value !== assigned.from || till.value !== assigned.till)) freeze();
    if (autoDates) {
      const available = remote?.status === "ready" ? limits : saved;
      if (available) { from.value = available.min; till.value = available.max; }
    }
    [from, till].forEach((input) => { input.min = limits.min; input.max = limits.max; });
    const range = WorkbenchDataHelpers.normalizeDateRange(
      { from: from.value, till: till.value, ...limits },
      editedId,
    );
    from.value = range.from;
    till.value = range.till;
    if (autoDates) assigned = { from: range.from, till: range.till };
    const note = saved && remote?.status !== "ready" ? "savedHistoryAvailable"
      : remote?.status === "loading" ? "checkingHistoryRange"
      : remote?.status === "error" ? "historyRangeFailed"
      : remote?.status === "ready" ? "historyRangeAvailable" : "dateRangeAvailable";
    $("dateRangeNote").textContent = t(note, {
      from: (note === "savedHistoryAvailable" ? saved.min : limits.min) || t("unknownDate"),
      till: note === "savedHistoryAvailable" ? saved.max : limits.max, error: remote?.error || "",
    });
    if (notify && range.changed) setStatus(t("dateRangeAdjusted", range), "idle");
    return range;
  }

  return { init, refresh, resetAutoRange, freeze };
})();
