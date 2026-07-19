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

async function checkForUpdate() {
  try {
    const { apiBase } = await chrome.storage.sync.get(["apiBase"]);
    const base = (apiBase || DEFAULTS.apiBase).replace(/\/$/, "");
    const res = await fetch(`${base}/api/extension/version`, {
      cache: "no-store",
    });
    if (!res.ok) return;
    const remote = await res.json();
    const local = chrome.runtime.getManifest().version;
    const update = {
      localVersion: local,
      remoteVersion: remote.version,
      downloadUrl: remote.downloadUrl,
      releaseNotes: remote.releaseNotes || "",
      updateAvailable: remote.version !== local,
      checkedAt: new Date().toISOString(),
    };
    await chrome.storage.local.set({ extensionUpdate: update });
    if (update.updateAvailable) {
      chrome.action.setBadgeText({ text: "UP" });
      chrome.action.setBadgeBackgroundColor({ color: "#0d7a5f" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  } catch {
    /* ignore */
  }
}

chrome.alarms.create("scrm-update-check", { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "scrm-update-check") checkForUpdate();
});

async function getApiConfig() {
  const data = await chrome.storage.sync.get([
    "apiBase",
    "apiKey",
    "deepScrapeDelayMs",
    "deepScrapeMaxProfiles",
  ]);
  return {
    apiBase: (data.apiBase || DEFAULTS.apiBase).replace(/\/$/, ""),
    apiKey: data.apiKey || "",
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
  const { apiBase, apiKey } = await getApiConfig();
  if (!apiKey) throw new Error("API key missing");
  const res = await fetch(`${apiBase}/api/extension/capture`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "CHECK_UPDATE") {
    checkForUpdate().then(() => sendResponse({ ok: true }));
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

checkForUpdate();
