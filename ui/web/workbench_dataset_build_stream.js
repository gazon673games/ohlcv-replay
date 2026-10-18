const WorkbenchDatasetBuildStream = (() => {
  let activeJobId = null;
  let sequence = 0;

  function start(jobId, label) {
    activeJobId = jobId;
    sequence = 0;
    WorkbenchStreamUI.beginDatasetBuild(label);
  }

  async function update(progress) {
    if (!activeJobId || progress.run_id !== activeJobId) return;
    try {
      await pullAvailable(2);
    } catch (error) {
      console.warn("Dataset preview is temporarily unavailable", error);
    }
  }

  async function finish(jobId) {
    if (!activeJobId || activeJobId !== jobId) return;
    try {
      await pullAvailable(100);
    } catch (error) {
      console.warn("Could not finish the provisional dataset preview", error);
    }
  }

  function stop() {
    activeJobId = null;
    sequence = 0;
  }

  async function pullAvailable(maxRequests) {
    const jobId = activeJobId;
    for (let request = 0; request < maxRequests; request += 1) {
      if (activeJobId !== jobId) return;
      const payload = await pullOnce();
      if (activeJobId !== jobId) return;
      if (sequence >= Number(payload.latest_sequence || 0)) return;
    }
  }

  async function pullOnce() {
    const jobId = activeJobId;
    const id = encodeURIComponent(jobId);
    const payload = await WorkbenchApi.get(
      `/api/dataset-builds/${id}/preview?after=${sequence}`,
    );
    if (activeJobId !== jobId) return payload;
    sequence = Number(payload.next_sequence || sequence);
    await WorkbenchStreamUI.appendDatasetBuildPreview(payload.rows || []);
    return payload;
  }

  return { finish, start, stop, update };
})();
