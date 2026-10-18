const WorkbenchMarketMarkers = (() => {
  const data = WorkbenchMarketChartData;
  const MAX_LABELS = 80;

  function bound(entries, time, inclusive) {
    let low = 0;
    let high = entries.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (entries[middle].marker.time < time || (inclusive && entries[middle].marker.time === time)) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  function create(api) {
    let entries = [];
    let invalid = true;
    let renderedKey = null;
    let revision = 0;
    const labels = new Map();
    let language = document.documentElement.lang;

    function invalidate() { invalid = true; }
    function reset() {
      entries = [];
      labels.clear();
      invalid = true;
      renderedKey = null;
      api.setMarkers([]);
    }

    function render(rows, candles, range, selected = []) {
      if (invalid) {
        entries = data.markerIndex(rows, candles);
        labels.clear();
        invalid = false;
        revision++;
      }
      if (language !== document.documentElement.lang) {
        language = document.documentElement.lang;
        labels.clear();
      }
      const first = range ? bound(entries, Number(range.from), false) : 0;
      const end = range ? bound(entries, Number(range.to), true) : entries.length;
      const showLabels = end - first <= MAX_LABELS;
      const stats = { markerCount: entries.length, markerLabelCount: showLabels ? end - first : 0 };
      const key = JSON.stringify([revision, language, first, end, showLabels, selected]);
      if (key === renderedKey) return stats;
      renderedKey = key;
      // Only submit markers in the viewport. IDs and the complete execution index survive panning.
      const visible = entries.slice(first, end).map(({ marker, row }) => {
        if (!showLabels) return marker;
        if (!labels.has(marker.id)) labels.set(marker.id, data.markerLabel(row, data.executedDelta(row)));
        return { ...marker, text: labels.get(marker.id) };
      });
      api.setMarkers(selected.length ? [...visible, ...selected].sort((a, b) => a.time - b.time) : visible);
      return stats;
    }

    return { invalidate, render, reset };
  }

  return { create };
})();
