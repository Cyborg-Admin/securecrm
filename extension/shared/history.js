(() => {
  const KEY = "captureHistory";
  const MAX = 100;

  async function list() {
    const data = await chrome.storage.local.get([KEY]);
    return Array.isArray(data[KEY]) ? data[KEY] : [];
  }

  async function clear() {
    await chrome.storage.local.set({ [KEY]: [] });
  }

  async function recordCapture(payload, res) {
    const leads = payload?.leads || [];
    if (!leads.length && !res?.batchId) return;

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      source: payload?.source || "unknown",
      sourceUrl: payload?.sourceUrl || "",
      created: res?.created ?? 0,
      updated: res?.updated ?? 0,
      names: leads
        .slice(0, 8)
        .map((l) => l.fullName)
        .filter(Boolean),
      count: leads.length,
    };

    const prev = await list();
    prev.unshift(entry);
    await chrome.storage.local.set({ [KEY]: prev.slice(0, MAX) });
  }

  window.SecureCRMHistory = { list, clear, recordCapture };
})();
