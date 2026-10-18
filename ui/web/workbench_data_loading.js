const WorkbenchDataLoading = (() => {
  const { $, setStatus, state } = WorkbenchCore;
  const { t } = WorkbenchI18n;

  async function download(request, label, { preview = true, isCurrent = () => true } = {}) {
    setStatus(t("loadingMarketData"), "running");
    try {
      const payload = await WorkbenchApi.post("/api/datasets/build/async", request);
      state.currentJobId = payload.run_id;
      $("cancelButton").disabled = false;
      if (!isCurrent()) {
        await WorkbenchApi.post(`/api/jobs/${encodeURIComponent(payload.run_id)}/cancel`).catch(() => {});
      }
      if (preview && isCurrent()) WorkbenchDatasetBuildStream.start(payload.run_id, label);
      const progress = await WorkbenchRunUI.pollJob(payload.run_id,
        preview ? async update => {
          if (isCurrent()) await WorkbenchDatasetBuildStream.update(update);
          else WorkbenchDatasetBuildStream.stop();
        } : null, { isCurrent });
      if (preview && isCurrent()) await WorkbenchDatasetBuildStream.finish(payload.run_id);
      return progress;
    } finally {
      if (preview) WorkbenchDatasetBuildStream.stop();
      state.currentJobId = null;
      $("cancelButton").disabled = true;
    }
  }

  return { download };
})();
