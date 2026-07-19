(() => {
  const DEFAULT_BASE = "https://crm.cyborgwales.com";

  async function getConfig() {
    const data = await chrome.storage.sync.get([
      "apiBase",
      "apiKey",
      "showBadges",
      "autoScanGmail",
      "showFab",
      "bulkPageLimit",
      "compactCrmLimit",
      "deepScrapeDelayMs",
      "deepScrapeMaxProfiles",
      "trainMode",
    ]);
    return {
      apiBase: (data.apiBase || DEFAULT_BASE).replace(/\/$/, ""),
      apiKey: data.apiKey || "",
      showBadges: data.showBadges !== false,
      autoScanGmail: data.autoScanGmail !== false,
      showFab: data.showFab !== false,
      bulkPageLimit: Number(data.bulkPageLimit) || 10,
      compactCrmLimit: Number(data.compactCrmLimit) || 25,
      deepScrapeDelayMs: Number(data.deepScrapeDelayMs) || 3000,
      deepScrapeMaxProfiles: Number(data.deepScrapeMaxProfiles) || 25,
      trainMode: Boolean(data.trainMode),
    };
  }

  async function crmFetch(path, options = {}) {
    const { apiBase, apiKey } = await getConfig();
    if (!apiKey) {
      throw new Error("Set your KINETIC API key in the side panel.");
    }

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
    const res = await crmFetch("/api/extension/capture", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    try {
      window.SecureCRMHistory?.recordCapture?.(payload, res);
    } catch {
      /* ignore */
    }
    return res;
  }

  async function matchPerson(payload) {
    return crmFetch("/api/extension/match", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function logActivity(payload) {
    return crmFetch("/api/extension/activity", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function lookupLinkedIn(urls) {
    const unique = [...new Set((urls || []).filter(Boolean))].slice(0, 150);
    if (!unique.length) return { results: {} };
    return crmFetch("/api/extension/lookup", {
      method: "POST",
      body: JSON.stringify({ linkedinUrls: unique }),
    });
  }

  async function searchLeads(q, limit = 25) {
    const params = new URLSearchParams({
      limit: String(limit),
    });
    if (q) params.set("q", q);
    return crmFetch(`/api/leads?${params.toString()}`);
  }

  async function fetchVersion() {
    const { apiBase } = await getConfig();
    const res = await fetch(`${apiBase}/api/extension/version`, {
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Version check failed ${res.status}`);
    return json;
  }

  function normalizeLinkedIn(url) {
    if (!url) return "";
    const cleaned = String(url)
      .trim()
      .split("?")[0]
      .split("#")[0]
      .replace(/\/+$/, "");
    const m = cleaned.match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (m) return `https://www.linkedin.com/in/${m[1]}`;
    const s = cleaned.match(/linkedin\.com\/sales\/lead\/([^,/?#]+)/i);
    if (s) return `https://www.linkedin.com/sales/lead/${s[1]}`;
    if (cleaned.startsWith("http")) return cleaned;
    return `https://www.linkedin.com/in/${cleaned.replace(/^\/+/, "")}`;
  }

  function linkedInUid(url) {
    const normalized = normalizeLinkedIn(url);
    const m = normalized.match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (m) return `linkedin.com/in/${decodeURIComponent(m[1]).toLowerCase()}`;
    const s = normalized.match(/linkedin\.com\/sales\/lead\/([^,/?#]+)/i);
    if (s) return `linkedin.com/sales/lead/${s[1]}`;
    return normalized.toLowerCase().replace(/^https?:\/\//, "");
  }

  function text(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  window.SecureCRM = {
    getConfig,
    crmFetch,
    captureLeads,
    matchPerson,
    logActivity,
    lookupLinkedIn,
    searchLeads,
    fetchVersion,
    normalizeLinkedIn,
    linkedInUid,
    text,
  };
})();
