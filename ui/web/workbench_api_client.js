const WorkbenchApi = (() => {
  async function get(url) {
    const response = await fetch(url);
    return responsePayload(response);
  }

  async function post(url, body = {}) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return responsePayload(response);
  }

  async function safeGet(url, fallback) {
    try {
      return await get(url);
    } catch {
      return fallback;
    }
  }

  async function responsePayload(response) {
    const payload = await response.json();
    if (!response.ok || payload.status === "failed") {
      throw new Error(payload.error || payload.message || response.statusText);
    }
    return payload;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  return { get, post, safeGet, sleep };
})();
