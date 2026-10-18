const WorkbenchHistoryUI = (() => {
  const { $, escapeHtml } = WorkbenchCore;
  let runs = [];
  let selected = new Set();

  function init() {
    $("historyTable").addEventListener("change", event => {
      const input = event.target.closest("input[data-run-id]");
      if (!input) return;
      if (input.checked) selected.add(input.dataset.runId);
      else selected.delete(input.dataset.runId);
      $("compareRunIds").value = [...selected].join(",");
      updateNote();
    });
    $("historyTable").addEventListener("click", event => {
      const button = event.target.closest("button[data-run-id]");
      if (!button) return;
      $("historySelect").value = button.dataset.runId;
      $("loadRunButton").click();
    });
    $("compareRunIds").addEventListener("input", () => {
      selected = new Set($("compareRunIds").value.split(",").map(id => id.trim()).filter(Boolean));
      render(runs);
    });
    window.addEventListener("workbench-preferences-change", () => render(runs));
  }

  function render(items) {
    runs = items;
    const columns = [WorkbenchUX.t("compareSelection"), "run_id", "status", "created_at", "params / portfolio"];
    const head = `<tr>${columns.map(name => `<th>${escapeHtml(name)}</th>`).join("")}</tr>`;
    $("historyTable").innerHTML = head + runs.map(run => {
      const id = escapeHtml(run.run_id);
      const completed = run.status === "completed";
      const description = run.kind === "portfolio" ? `${run.name}: ${(run.asset_ids || []).join(", ")}` : JSON.stringify(run.params || {});
      return `<tr><td><label class="history-selection"><input type="checkbox" data-run-id="${id}" ${selected.has(run.run_id) ? "checked" : ""} ${completed ? "" : "disabled"} aria-label="${id}" /></label></td><td><button class="trade-jump" data-run-id="${id}" ${completed ? "" : "disabled"}>${id}</button></td><td>${escapeHtml(run.status)}</td><td>${escapeHtml(run.created_at || "")}</td><td>${escapeHtml(description)}</td></tr>`;
    }).join("");
    updateNote();
  }

  function updateNote() {
    $("compareSelectionNote").textContent = `${WorkbenchUX.t("compareSelected")}: ${selected.size}`;
  }
  return { init, render };
})();
