const DEFAULTS = {
  apiBase: "https://crm.cyborgwales.com",
  showBadges: true,
  autoScanGmail: true,
  showFab: true,
  bulkPageLimit: 10,
  compactCrmLimit: 25,
  deepScrapeDelayMs: 3000,
  deepScrapeMaxProfiles: 25,
  trainMode: false,
};

let deepScrape = {
  running: false,
  stop: false,
  queue: [],
  done: 0,
  created: 0,
  updated: 0,
  errors: 0,
  groupId: null,
  status: "idle",
};

let updateWindowId = null;
let applyingUpdate = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(null, (data) => {
    const patch = {};
    for (const [key, value] of Object.entries(DEFAULTS)) {
      if (data[key] === undefined) patch[key] = value;
    }
    if (Object.keys(patch).length) chrome.storage.sync.set(patch);
  });

  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {});

function compareVersions(a, b) {
  const pa = String(a || "0")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

async function getInstallType() {
  try {
    const self = await chrome.management.getSelf();
    return self.installType || "unknown";
  } catch {
    return "unknown";
  }
}

async function openUpdaterWindow() {
  if (updateWindowId != null) {
    try {
      await chrome.windows.update(updateWindowId, { focused: true });
      return;
    } catch {
      updateWindowId = null;
    }
  }
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL("updater/updater.html"),
    type: "popup",
    width: 460,
    height: 320,
    focused: true,
  });
  updateWindowId = win.id ?? null;
}

chrome.windows.onRemoved.addListener((id) => {
  if (id === updateWindowId) updateWindowId = null;
});

// Store / enterprise installs: apply as soon as Chrome downloads the package
chrome.runtime.onUpdateAvailable.addListener(() => {
  chrome.runtime.reload();
});

async function checkForUpdate({ apply = true } = {}) {
  try {
    const { apiBase } = await chrome.storage.sync.get(["apiBase"]);
    const base = (apiBase || DEFAULTS.apiBase).replace(/\/$/, "");
    const res = await fetch(`${base}/api/extension/version`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const remote = await res.json();
    const local = chrome.runtime.getManifest().version;
    const updateAvailable = compareVersions(remote.version, local) > 0;
    const update = {
      localVersion: local,
      remoteVersion: remote.version,
      downloadUrl: remote.downloadUrl,
      sourcesUrl: remote.sourcesUrl || `${base}/api/extension/sources`,
      releaseNotes: remote.releaseNotes || "",
      updateAvailable,
      checkedAt: new Date().toISOString(),
      autoUpdate: Boolean(remote.autoUpdate),
    };
    await chrome.storage.local.set({ extensionUpdate: update });

    if (!updateAvailable) {
      chrome.action.setBadgeText({ text: "" });
      return update;
    }

    chrome.action.setBadgeText({ text: "UP" });
    chrome.action.setBadgeBackgroundColor({ color: "#0d7a5f" });

    if (!apply || applyingUpdate) return update;
    applyingUpdate = true;
    try {
      const installType = await getInstallType();
      if (installType === "normal" || installType === "admin") {
        const status = await chrome.runtime.requestUpdateCheck();
        if (status.status === "update_available") {
          // onUpdateAvailable → reload
          return update;
        }
      }

      const { autoUpdateEnabled } = await chrome.storage.local.get([
        "autoUpdateEnabled",
      ]);
      await chrome.storage.local.set({ pendingAutoUpdate: true });

      if (autoUpdateEnabled) {
        await openUpdaterWindow();
      }
      // Otherwise leave the UP badge — user opens side panel → Update now
    } finally {
      applyingUpdate = false;
    }
    return update;
  } catch {
    return null;
  }
}

chrome.alarms.create("scrm-update-check", { periodInMinutes: 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "scrm-update-check") {
    checkForUpdate({ apply: true });
  }
});

async function getApiConfig() {
  const data = await chrome.storage.sync.get([
    "apiBase",
    "apiKey",
    "sessionToken",
    "csrfToken",
    "deepScrapeDelayMs",
    "deepScrapeMaxProfiles",
  ]);
  return {
    apiBase: (data.apiBase || DEFAULTS.apiBase).replace(/\/$/, ""),
    apiKey: data.apiKey || "",
    sessionToken: data.sessionToken || "",
    csrfToken: data.csrfToken || "",
    delay: Number(data.deepScrapeDelayMs) || DEFAULTS.deepScrapeDelayMs,
    max: Number(data.deepScrapeMaxProfiles) || DEFAULTS.deepScrapeMaxProfiles,
  };
}

async function ensureGroup(tabId) {
  try {
    if (deepScrape.groupId != null) {
      await chrome.tabs.group({ groupId: deepScrape.groupId, tabIds: [tabId] });
      return deepScrape.groupId;
    }
    const groupId = await chrome.tabs.group({ tabIds: [tabId] });
    await chrome.tabGroups.update(groupId, {
      title: "KINETIC",
      color: "green",
    });
    deepScrape.groupId = groupId;
    return groupId;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForTabComplete(tabId, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (deepScrape.stop) return false;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return false;
    if (tab.status === "complete") return true;
    await sleep(250);
  }
  return true;
}

async function scrapeTab(tabId) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, {
        type: "SCRM_SCRAPE_PROFILE",
      });
      if (res?.ok && res.lead) return res;
    } catch {
      /* content script not ready */
    }
    await sleep(600);
  }
  return { ok: false, error: "No content script response" };
}

async function captureLeadRemote(lead) {
  const { apiBase, apiKey, sessionToken, csrfToken } = await getApiConfig();
  if (!sessionToken && !apiKey) throw new Error("Sign in to KINETIC in the side panel");
  const headers = {
    "Content-Type": "application/json",
  };
  if (sessionToken) {
    headers.Authorization = `Bearer ${sessionToken}`;
    headers["X-Session-Token"] = sessionToken;
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  } else {
    headers["X-API-Key"] = apiKey;
  }
  const res = await fetch(`${apiBase}/api/extension/capture`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      source: "linkedin",
      sourceUrl: lead.linkedinUrl,
      startBatch: deepScrape.done === 0,
      finishBatch: false,
      leads: [lead],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Capture ${res.status}`);
  return json;
}

async function publishStatus() {
  await chrome.storage.local.set({
    deepScrapeStatus: {
      running: deepScrape.running,
      status: deepScrape.status,
      done: deepScrape.done,
      remaining: deepScrape.queue.length,
      created: deepScrape.created,
      updated: deepScrape.updated,
      errors: deepScrape.errors,
      at: new Date().toISOString(),
    },
  });
}

async function runDeepScrape(urls) {
  if (deepScrape.running) return;
  const cfg = await getApiConfig();
  const queue = [...new Set(urls.filter(Boolean))].slice(0, cfg.max);
  if (!queue.length) {
    deepScrape.status = "No profile URLs queued";
    await publishStatus();
    return;
  }

  deepScrape = {
    running: true,
    stop: false,
    queue,
    done: 0,
    created: 0,
    updated: 0,
    errors: 0,
    groupId: null,
    status: `Starting ${queue.length} profiles…`,
  };
  await publishStatus();

  while (deepScrape.queue.length && !deepScrape.stop) {
    const url = deepScrape.queue.shift();
    deepScrape.status = `Opening ${url}`;
    await publishStatus();

    let tabId = null;
    try {
      const tab = await chrome.tabs.create({ url, active: false });
      tabId = tab.id;
      await ensureGroup(tabId);
      await waitForTabComplete(tabId);
      await sleep(cfg.delay);

      const scraped = await scrapeTab(tabId);
      if (!scraped.ok || !scraped.lead) {
        deepScrape.errors += 1;
        deepScrape.status = scraped.error || "Scrape failed";
      } else {
        const out = await captureLeadRemote(scraped.lead);
        deepScrape.created += out.created || 0;
        deepScrape.updated += out.updated || 0;
        deepScrape.status = `Saved ${scraped.lead.fullName}`;
      }
      deepScrape.done += 1;
    } catch (e) {
      deepScrape.errors += 1;
      deepScrape.status = e.message || "Deep scrape error";
      deepScrape.done += 1;
    } finally {
      if (tabId != null) {
        await chrome.tabs.remove(tabId).catch(() => {});
      }
      await publishStatus();
      if (deepScrape.queue.length && !deepScrape.stop) {
        await sleep(Math.max(800, Math.floor(cfg.delay / 2)));
      }
    }
  }

  deepScrape.running = false;
  deepScrape.status = deepScrape.stop
    ? `Stopped. ${deepScrape.done} done, ${deepScrape.errors} errors.`
    : `Finished. ${deepScrape.created} new, ${deepScrape.updated} updated, ${deepScrape.errors} errors.`;
  await publishStatus();
}

chrome.runtime.onMessageExternal.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "KINETIC_PING" || msg?.type === "PING") {
    sendResponse({
      ok: true,
      version: chrome.runtime.getManifest().version,
      extensionId: chrome.runtime.id,
      name: chrome.runtime.getManifest().name,
    });
    return true;
  }
  return false;
});

/** Latest page context from content scripts, keyed by tab id. */
const pageContextByTab = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "PAGE_CONTEXT") {
    const tabId = sender.tab?.id;
    if (tabId != null) {
      pageContextByTab.set(tabId, {
        tabId,
        site: msg.site || "unknown",
        empty: Boolean(msg.empty),
        fingerprint: msg.fingerprint || "",
        person: msg.person || null,
        at: Date.now(),
      });
    }
    // Notify sidepanel (and other extension pages) if open
    chrome.runtime.sendMessage({ type: "PAGE_CONTEXT_UPDATED" }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }
  if (msg?.type === "GET_PAGE_CONTEXT") {
    const reply = (tabId) => {
      const cached = tabId != null ? pageContextByTab.get(tabId) : null;
      sendResponse({ ok: true, context: cached || null, tabId: tabId || null });
    };
    if (msg.tabId != null) {
      reply(msg.tabId);
      return false;
    }
    chrome.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
      reply(tabs[0]?.id);
    });
    return true;
  }
  if (msg?.type === "REQUEST_PAGE_PARSE") {
    const run = async () => {
      const tabs = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      const tab = tabs[0];
      if (!tab?.id) return { ok: false, error: "No active tab" };
      try {
        const res = await chrome.tabs.sendMessage(tab.id, {
          type: "SCRM_GET_PAGE_PERSON",
        });
        if (res?.person) {
          pageContextByTab.set(tab.id, {
            tabId: tab.id,
            site: "gmail",
            empty: false,
            fingerprint: res.fingerprint || "",
            person: res.person,
            at: Date.now(),
          });
        }
        return { ok: Boolean(res?.ok), person: res?.person || null, tabId: tab.id };
      } catch (e) {
        return { ok: false, error: e?.message || "Content script unavailable" };
      }
    };
    run().then(sendResponse);
    return true;
  }
  if (msg?.type === "CHECK_UPDATE") {
    checkForUpdate({ apply: Boolean(msg.apply) })
      .then((update) => sendResponse({ ok: true, update }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "APPLY_UPDATE") {
    openUpdaterWindow()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "OPEN_SIDE_PANEL") {
    const tabId = msg.tabId || sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "No tab" });
      return false;
    }
    chrome.sidePanel.open({ tabId }).then(
      () => sendResponse({ ok: true }),
      (e) => sendResponse({ ok: false, error: String(e) }),
    );
    return true;
  }
  if (msg?.type === "START_DEEP_SCRAPE") {
    runDeepScrape(msg.urls || []).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "STOP_DEEP_SCRAPE") {
    deepScrape.stop = true;
    deepScrape.status = "Stopping…";
    publishStatus().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "GET_DEEP_SCRAPE_STATUS") {
    sendResponse({
      running: deepScrape.running,
      status: deepScrape.status,
      done: deepScrape.done,
      remaining: deepScrape.queue.length,
      created: deepScrape.created,
      updated: deepScrape.updated,
      errors: deepScrape.errors,
    });
    return false;
  }
  return false;
});

checkForUpdate({ apply: true });
