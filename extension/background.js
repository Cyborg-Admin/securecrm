const DEFAULTS = {
  apiBase: "https://crm.cyborgwales.com",
  showBadges: true,
  autoScanGmail: true,
  showFab: true,
  bulkPageLimit: 10,
  compactCrmLimit: 25,
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
    // Offline / CRM unreachable — ignore
  }
}

chrome.alarms.create("scrm-update-check", { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "scrm-update-check") checkForUpdate();
});

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
  return false;
});

checkForUpdate();
