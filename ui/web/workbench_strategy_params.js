const WorkbenchStrategyParams = (() => {
  function collect(controls) {
    return Object.fromEntries(Array.from(controls || []).map((input) => [
      input.dataset.param,
      input.type === "checkbox" ? input.checked : input.value,
    ]));
  }

  function resolve(specs, preferred = {}) {
    const supplied = preferred && typeof preferred === "object" ? preferred : {};
    return Object.fromEntries((specs || []).map((spec) => [
      spec.name,
      Object.prototype.hasOwnProperty.call(supplied, spec.name)
        ? supplied[spec.name]
        : spec.default ?? "",
    ]));
  }

  function checked(value) {
    if (typeof value === "boolean") return value;
    return ["1", "true", "yes", "y"].includes(String(value).trim().toLowerCase());
  }

  return { checked, collect, resolve };
})();

if (typeof module !== "undefined") module.exports = WorkbenchStrategyParams;
