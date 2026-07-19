(() => {
  const DEFAULT_BASE = "http://localhost:3000";

  async function getConfig() {
    const data = await chrome.storage.sync.get(["apiBase", "apiKey"]);
    return {
      apiBase: (data.apiBase || DEFAULT_BASE).replace(/\/$/, ""),
      apiKey: data.apiKey || "",
    };
  }

  async function crmFetch(path, options = {}) {
    const { apiBase, apiKey } = await getConfig();
    if (!apiKey) throw new Error("Set your SecureCRM API key in the extension popup.");

    const res = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        ...(options.headers || {}),
      },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `CRM error ${res.status}`);
    return json;
  }

  async function captureLeads(payload) {
    return crmFetch("/api/extension/capture", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function matchPerson(payload) {
    return crmFetch("/api/extension/match", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  function normalizeLinkedIn(url) {
    if (!url) return "";
    const cleaned = String(url).trim().split("?")[0].split("#")[0].replace(/\/+$/, "");
    const m = cleaned.match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (m) return `https://www.linkedin.com/in/${m[1]}`;
    const s = cleaned.match(/linkedin\.com\/sales\/lead\/([^,/?#]+)/i);
    if (s) return `https://www.linkedin.com/sales/lead/${s[1]}`;
    if (cleaned.startsWith("http")) return cleaned;
    return `https://www.linkedin.com/in/${cleaned.replace(/^\/+/, "")}`;
  }

  function text(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  window.SecureCRM = {
    getConfig,
    captureLeads,
    matchPerson,
    normalizeLinkedIn,
    text,
  };
})();
