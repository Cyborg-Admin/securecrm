(() => {
  const DEFAULT_BASE = "https://crm.cyborgwales.com";

  async function getConfig() {
    const data = await chrome.storage.sync.get([
      "apiBase",
      "apiKey",
      "sessionToken",
      "csrfToken",
      "userEmail",
      "userName",
      "orgName",
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
      sessionToken: data.sessionToken || "",
      csrfToken: data.csrfToken || "",
      userEmail: data.userEmail || "",
      userName: data.userName || "",
      orgName: data.orgName || "",
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

  function authHeaders(cfg, method = "GET") {
    const headers = {
      "Content-Type": "application/json",
    };
    if (cfg.sessionToken) {
      headers.Authorization = `Bearer ${cfg.sessionToken}`;
      headers["X-Session-Token"] = cfg.sessionToken;
      if (["POST", "PUT", "PATCH", "DELETE"].includes(String(method).toUpperCase())) {
        if (cfg.csrfToken) headers["X-CSRF-Token"] = cfg.csrfToken;
      }
    } else if (cfg.apiKey) {
      // Legacy fallback for older installs
      headers["X-API-Key"] = cfg.apiKey;
    }
    return headers;
  }

  async function crmFetch(path, options = {}) {
    const cfg = await getConfig();
    if (!cfg.sessionToken && !cfg.apiKey) {
      throw new Error("Sign in to KINETIC in the side panel.");
    }

    const method = options.method || "GET";
    const res = await fetch(`${cfg.apiBase}${path}`, {
      ...options,
      headers: {
        ...authHeaders(cfg, method),
        ...(options.headers || {}),
      },
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new Error("Session expired — sign in again in the side panel.");
    }
    if (!res.ok) throw new Error(json.error || `CRM error ${res.status}`);
    return json;
  }

  async function login(email, password, apiBase) {
    const base = (apiBase || (await getConfig()).apiBase).replace(/\/$/, "");
    const res = await fetch(`${base}/api/extension/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Login failed (${res.status})`);

    await chrome.storage.sync.set({
      apiBase: base,
      sessionToken: json.sessionToken,
      csrfToken: json.csrfToken,
      userEmail: json.user?.email || email,
      userName: json.user?.full_name || "",
      // Clear legacy API key so sessions are the source of truth
      apiKey: "",
    });

    try {
      const me = await crmFetch("/api/extension/auth/me");
      if (me.organization?.name) {
        await chrome.storage.sync.set({ orgName: me.organization.name });
      }
      if (me.csrfToken) {
        await chrome.storage.sync.set({ csrfToken: me.csrfToken });
      }
    } catch {
      /* me is best-effort */
    }

    return json;
  }

  async function logout() {
    const cfg = await getConfig();
    if (cfg.sessionToken) {
      try {
        await fetch(`${cfg.apiBase}/api/extension/auth/logout`, {
          method: "POST",
          headers: authHeaders(cfg, "POST"),
        });
      } catch {
        /* ignore network errors on logout */
      }
    }
    await chrome.storage.sync.set({
      sessionToken: "",
      csrfToken: "",
      userEmail: "",
      userName: "",
      orgName: "",
      apiKey: "",
    });
  }

  async function refreshSession() {
    const cfg = await getConfig();
    if (!cfg.sessionToken) return null;
    const me = await crmFetch("/api/extension/auth/me");
    await chrome.storage.sync.set({
      userEmail: me.user?.email || cfg.userEmail,
      userName: me.user?.full_name || cfg.userName,
      orgName: me.organization?.name || cfg.orgName,
      csrfToken: me.csrfToken || cfg.csrfToken,
    });
    return me;
  }

  async function isSignedIn() {
    const cfg = await getConfig();
    return Boolean(cfg.sessionToken || cfg.apiKey);
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

  async function enrich(payload) {
    return crmFetch("/api/extension/enrich", {
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
    return crmFetch(`/api/extension/leads?${params.toString()}`);
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

  /** Nodes / subtrees injected by this extension — never scrape these. */
  const INJECT_SELECTOR = [
    "#scrm-train-overlay",
    "#securecrm-panel",
    "#scrm-fab-root",
    "#securecrm-form",
    "#scrm-profile-status",
    "#scrm-float-linkedin",
    ".scrm-crm-badge",
    ".scrm-avatar-wrap",
    ".scrm-avatar-label",
    ".scrm-profile-status",
    ".scrm-fab-root",
    ".scrm-train-hover",
    ".scrm-train-selected-el",
  ].join(", ");

  const NOISE_LINE =
    /^(lead|contact|not in crm|kinetic|train mode|capture|enrich|follow|connect|message|pending|save|more)$/i;

  function isOurUi(node) {
    if (!node) return false;
    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!(el instanceof Element)) return false;
    try {
      return Boolean(el.closest(INJECT_SELECTOR));
    } catch {
      return false;
    }
  }

  /** Visible text excluding our injected UI subtrees. */
  function text(el) {
    if (!el) return "";
    if (isOurUi(el)) return "";

    if (typeof el.querySelector === "function") {
      try {
        if (!el.querySelector(INJECT_SELECTOR)) {
          return (el.textContent || "").replace(/\s+/g, " ").trim();
        }
      } catch {
        /* fall through */
      }
    }

    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (isOurUi(node)) return NodeFilter.FILTER_REJECT;
        const value = (node.nodeValue || "").replace(/\s+/g, " ").trim();
        if (!value) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let current = walker.nextNode();
    while (current) {
      parts.push((current.nodeValue || "").replace(/\s+/g, " ").trim());
      current = walker.nextNode();
    }
    return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  function isNoiseText(value) {
    const t = String(value || "").trim();
    if (!t) return true;
    if (NOISE_LINE.test(t)) return true;
    if (/^scrm-/i.test(t)) return true;
    return false;
  }

  function cleanLines(lines) {
    return (lines || [])
      .map((l) => String(l || "").replace(/\s+/g, " ").trim())
      .filter((l) => l && !isNoiseText(l));
  }

  window.SecureCRM = {
    getConfig,
    crmFetch,
    login,
    logout,
    refreshSession,
    isSignedIn,
    captureLeads,
    matchPerson,
    logActivity,
    enrich,
    lookupLinkedIn,
    searchLeads,
    fetchVersion,
    normalizeLinkedIn,
    linkedInUid,
    text,
    isOurUi,
    isNoiseText,
    cleanLines,
    INJECT_SELECTOR,
  };
})();
