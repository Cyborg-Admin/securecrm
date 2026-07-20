const $ = (id) => document.getElementById(id);

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $(`tab-${tab.dataset.tab}`).classList.add("active");
    if (tab.dataset.tab === "history") renderHistory();
    if (tab.dataset.tab === "crm") searchLeads();
    if (tab.dataset.tab === "scrape") refreshDeepStatus();
  });
});

async function renderAccount() {
  const cfg = await SecureCRM.getConfig();
  const signedIn = Boolean(cfg.sessionToken || cfg.apiKey);
  $("accountSignedIn").hidden = !signedIn;
  $("accountSignedOut").hidden = signedIn;
  if ($("apiBase") && !$("apiBase").value) {
    $("apiBase").value = cfg.apiBase || "https://crm.cyborgwales.com";
  }
  if (signedIn) {
    const name = cfg.userName || cfg.userEmail || "Signed in";
    const org = cfg.orgName ? ` · ${cfg.orgName}` : "";
    $("accountSummary").textContent = `${name}${org}`;
  }
}

async function loadSettings() {
  const data = await chrome.storage.sync.get([
    "apiBase",
    "showBadges",
    "autoScanGmail",
    "showFab",
    "bulkPageLimit",
    "compactCrmLimit",
    "deepScrapeDelayMs",
    "deepScrapeMaxProfiles",
    "trainMode",
    "userEmail",
  ]);
  if ($("apiBase")) {
    $("apiBase").value = data.apiBase || "https://crm.cyborgwales.com";
  }
  if ($("loginEmail") && data.userEmail) {
    $("loginEmail").value = data.userEmail;
  }
  $("showBadges").checked = data.showBadges !== false;
  $("autoScanGmail").checked = data.autoScanGmail !== false;
  $("showFab").checked = data.showFab !== false;
  $("bulkPageLimit").value = data.bulkPageLimit ?? 10;
  $("compactCrmLimit").value = data.compactCrmLimit ?? 25;
  $("deepScrapeDelayMs").value = data.deepScrapeDelayMs ?? 3000;
  $("deepScrapeMaxProfiles").value = data.deepScrapeMaxProfiles ?? 25;
  $("trainMode").checked = Boolean(data.trainMode);
  $("localVersion").textContent = chrome.runtime.getManifest().version;
  await renderAccount();
  try {
    const cfg = await SecureCRM.getConfig();
    if (cfg.sessionToken) {
      await SecureCRM.refreshSession();
      await renderAccount();
    }
  } catch {
    await chrome.storage.sync.set({
      sessionToken: "",
      csrfToken: "",
      userEmail: "",
      userName: "",
      orgName: "",
    });
    await renderAccount();
  }
}

$("signIn")?.addEventListener("click", async () => {
  const status = $("authStatus");
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  const apiBase = $("apiBase").value.trim() || "https://crm.cyborgwales.com";
  if (!email || !password) {
    status.textContent = "Enter your work email and password.";
    return;
  }
  $("signIn").disabled = true;
  status.textContent = "Signing in…";
  try {
    await SecureCRM.login(email, password, apiBase);
    $("loginPassword").value = "";
    status.textContent = "Signed in.";
    await renderAccount();
    chrome.runtime.sendMessage({ type: "CHECK_UPDATE" });
  } catch (e) {
    status.textContent = e.message || "Sign-in failed";
  } finally {
    $("signIn").disabled = false;
  }
});

$("signOut")?.addEventListener("click", async () => {
  await SecureCRM.logout();
  $("authStatus").textContent = "Signed out.";
  await renderAccount();
});

$("saveSettings").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    apiBase: $("apiBase").value.trim() || "https://crm.cyborgwales.com",
    showBadges: $("showBadges").checked,
    autoScanGmail: $("autoScanGmail").checked,
    showFab: $("showFab").checked,
    bulkPageLimit: Math.min(50, Math.max(1, Number($("bulkPageLimit").value) || 10)),
    compactCrmLimit: Math.min(50, Math.max(5, Number($("compactCrmLimit").value) || 25)),
    deepScrapeDelayMs: Math.min(
      15000,
      Math.max(1000, Number($("deepScrapeDelayMs").value) || 3000),
    ),
    deepScrapeMaxProfiles: Math.min(
      50,
      Math.max(1, Number($("deepScrapeMaxProfiles").value) || 25),
    ),
  });
  $("settingsStatus").textContent = "Saved. Reload LinkedIn / Gmail tabs for FAB & badges.";
  chrome.runtime.sendMessage({ type: "CHECK_UPDATE" });
});

$("trainMode").addEventListener("change", async () => {
  const on = $("trainMode").checked;
  await chrome.storage.sync.set({ trainMode: on });
  $("settingsStatus").textContent = on
    ? "Train mode enabled — open a LinkedIn profile and click elements to map fields."
    : "Train mode disabled.";
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.trainMode && $("trainMode")) {
    $("trainMode").checked = Boolean(changes.trainMode.newValue);
  }
});

async function renderAutoUpdateStatus() {
  const el = $("autoUpdateStatus");
  if (!el) return;
  const { autoUpdateEnabled, autoUpdateFolderLinkedAt } =
    await chrome.storage.local.get([
      "autoUpdateEnabled",
      "autoUpdateFolderLinkedAt",
    ]);
  const handle = await KineticAutoUpdate.getDirHandle();
  if (autoUpdateEnabled && handle) {
    const when = autoUpdateFolderLinkedAt
      ? new Date(autoUpdateFolderLinkedAt).toLocaleString()
      : "linked";
    el.textContent = `Auto-updates on · folder linked ${when}`;
  } else {
    el.textContent =
      "Auto-updates off · link the unpacked extension folder once to enable.";
  }
}

async function renderUpdate() {
  const { extensionUpdate, autoUpdateEnabled } = await chrome.storage.local.get([
    "extensionUpdate",
    "autoUpdateEnabled",
  ]);
  const banner = $("updateBanner");
  if (!extensionUpdate?.updateAvailable) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  $("remoteVersion").textContent = extensionUpdate.remoteVersion;
  $("releaseNotes").textContent = extensionUpdate.releaseNotes || "";
  $("downloadUpdate").href = extensionUpdate.downloadUrl || "#";
  $("autoUpdateHint").textContent = autoUpdateEnabled
    ? "Auto-update is enabled — click Update now, or wait for the updater window."
    : "One-time: enable auto-updates in Settings (link folder), then updates apply themselves.";
}

$("checkUpdate").addEventListener("click", async () => {
  $("checkUpdate").disabled = true;
  await chrome.runtime.sendMessage({ type: "CHECK_UPDATE", apply: false });
  await new Promise((r) => setTimeout(r, 400));
  await renderUpdate();
  await renderAutoUpdateStatus();
  $("checkUpdate").disabled = false;
});

$("applyUpdate").addEventListener("click", async () => {
  $("applyUpdate").disabled = true;
  try {
    const handle = await KineticAutoUpdate.getDirHandle();
    if (!handle) {
      await KineticAutoUpdate.linkExtensionFolder();
    }
    $("autoUpdateHint").textContent = "Applying update…";
    const result = await KineticAutoUpdate.applyFolderUpdate({ force: true });
    if (!result.applied) {
      // Fallback: store/enterprise channel or permission prompt window
      await chrome.runtime.sendMessage({ type: "APPLY_UPDATE" });
      $("autoUpdateHint").textContent =
        result.reason === "permission_denied"
          ? "Allow folder access in the updater window."
          : "Opening updater…";
    } else {
      $("autoUpdateHint").textContent = `Updated to v${result.version}. Reloading…`;
    }
  } catch (e) {
    $("autoUpdateHint").textContent = e.message || "Could not start update";
  } finally {
    $("applyUpdate").disabled = false;
  }
});

$("linkAutoUpdate").addEventListener("click", async () => {
  try {
    await KineticAutoUpdate.linkExtensionFolder();
    $("settingsStatus").textContent =
      "Auto-updates enabled. New versions will sync and reload automatically.";
    await renderAutoUpdateStatus();
    await chrome.runtime.sendMessage({ type: "CHECK_UPDATE", apply: true });
  } catch (e) {
    $("settingsStatus").textContent = e.message || "Could not enable auto-updates";
  }
});

$("unlinkAutoUpdate").addEventListener("click", async () => {
  await KineticAutoUpdate.clearDirHandle();
  $("settingsStatus").textContent = "Auto-updates disabled.";
  await renderAutoUpdateStatus();
});

async function searchLeads() {
  const status = $("crmStatus");
  const list = $("leadList");
  list.innerHTML = "";
  status.textContent = "Loading…";
  try {
    const cfg = await SecureCRM.getConfig();
    const q = $("leadSearch").value.trim();
    const res = await SecureCRM.searchLeads(q, cfg.compactCrmLimit);
    const leads = res.leads || [];
    if (!leads.length) {
      status.textContent = "No leads found.";
      return;
    }
    for (const lead of leads) {
      const li = document.createElement("li");
      const company = lead.company_display || lead.company_name || "";
      li.innerHTML = `<strong></strong><span></span><span></span>`;
      li.querySelector("strong").textContent = lead.full_name || "Untitled";
      li.querySelectorAll("span")[0].textContent =
        [lead.job_title, company].filter(Boolean).join(" · ") || "No title";
      li.querySelectorAll("span")[1].textContent = `${lead.status || "—"} · ${lead.source || "—"}`;
      list.appendChild(li);
    }
    status.textContent = `${leads.length} lead${leads.length === 1 ? "" : "s"}`;
  } catch (e) {
    status.textContent = e.message || "Failed to load leads";
  }
}

let searchTimer = null;
$("leadSearch").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(searchLeads, 280);
});

async function renderHistory() {
  const items = await SecureCRMHistory.list();
  const list = $("historyList");
  const empty = $("historyEmpty");
  list.innerHTML = "";
  empty.hidden = items.length > 0;
  for (const item of items) {
    const li = document.createElement("li");
    const when = (item.at || "").slice(0, 19).replace("T", " ");
    li.innerHTML = `<strong></strong><span></span><span></span>`;
    li.querySelector("strong").textContent =
      item.names?.slice(0, 3).join(", ") || `${item.count || 0} profiles`;
    li.querySelectorAll("span")[0].textContent =
      `${item.source || "—"} · +${item.created || 0} / ~${item.updated || 0}`;
    li.querySelectorAll("span")[1].textContent = when;
    list.appendChild(li);
  }
}

$("clearHistory").addEventListener("click", async () => {
  await SecureCRMHistory.clear();
  renderHistory();
});

function parseUrls(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /linkedin\.com\/in\//i.test(l));
}

$("startDeep").addEventListener("click", async () => {
  const urls = parseUrls($("deepUrls").value);
  if (!urls.length) {
    $("deepStatus").textContent = "Paste at least one LinkedIn /in/ URL.";
    return;
  }
  $("deepStatus").textContent = `Starting ${urls.length}…`;
  await chrome.runtime.sendMessage({ type: "START_DEEP_SCRAPE", urls });
  refreshDeepStatus();
});

$("stopDeep").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "STOP_DEEP_SCRAPE" });
  refreshDeepStatus();
});

async function refreshDeepStatus() {
  try {
    const live = await chrome.runtime.sendMessage({
      type: "GET_DEEP_SCRAPE_STATUS",
    });
    if (live?.status) {
      $("deepStatus").textContent =
        `${live.status} · done ${live.done || 0} · left ${live.remaining || 0}` +
        (live.running ? " (running)" : "");
      return;
    }
  } catch {
    /* ignore */
  }
  const { deepScrapeStatus } = await chrome.storage.local.get(["deepScrapeStatus"]);
  if (deepScrapeStatus?.status) {
    $("deepStatus").textContent = deepScrapeStatus.status;
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.deepScrapeStatus) refreshDeepStatus();
});

setInterval(refreshDeepStatus, 2000);

loadSettings()
  .then(renderAutoUpdateStatus)
  .then(renderUpdate)
  .then(async () => {
    const { pendingAutoUpdate, autoUpdateEnabled } =
      await chrome.storage.local.get(["pendingAutoUpdate", "autoUpdateEnabled"]);
    if (pendingAutoUpdate && autoUpdateEnabled) {
      await chrome.runtime.sendMessage({ type: "APPLY_UPDATE" });
    }
  })
  .then(searchLeads)
  .then(refreshDeepStatus)
  .catch(() => {});
