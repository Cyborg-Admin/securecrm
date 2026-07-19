const $ = (id) => document.getElementById(id);

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $(`tab-${tab.dataset.tab}`).classList.add("active");
    if (tab.dataset.tab === "history") renderHistory();
    if (tab.dataset.tab === "crm") searchLeads();
  });
});

async function loadSettings() {
  const data = await chrome.storage.sync.get([
    "apiBase",
    "apiKey",
    "showBadges",
    "autoScanGmail",
    "showFab",
    "bulkPageLimit",
    "compactCrmLimit",
  ]);
  $("apiBase").value = data.apiBase || "https://crm.cyborgwales.com";
  $("apiKey").value = data.apiKey || "";
  $("showBadges").checked = data.showBadges !== false;
  $("autoScanGmail").checked = data.autoScanGmail !== false;
  $("showFab").checked = data.showFab !== false;
  $("bulkPageLimit").value = data.bulkPageLimit ?? 10;
  $("compactCrmLimit").value = data.compactCrmLimit ?? 25;
  $("localVersion").textContent = chrome.runtime.getManifest().version;
}

$("saveSettings").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    apiBase: $("apiBase").value.trim() || "https://crm.cyborgwales.com",
    apiKey: $("apiKey").value.trim(),
    showBadges: $("showBadges").checked,
    autoScanGmail: $("autoScanGmail").checked,
    showFab: $("showFab").checked,
    bulkPageLimit: Math.min(50, Math.max(1, Number($("bulkPageLimit").value) || 10)),
    compactCrmLimit: Math.min(50, Math.max(5, Number($("compactCrmLimit").value) || 25)),
  });
  $("settingsStatus").textContent = "Saved. Reload LinkedIn / Gmail tabs for FAB & badges.";
  chrome.runtime.sendMessage({ type: "CHECK_UPDATE" });
});

async function renderUpdate() {
  const { extensionUpdate } = await chrome.storage.local.get(["extensionUpdate"]);
  const banner = $("updateBanner");
  if (!extensionUpdate?.updateAvailable) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  $("remoteVersion").textContent = extensionUpdate.remoteVersion;
  $("releaseNotes").textContent = extensionUpdate.releaseNotes || "";
  $("downloadUpdate").href = extensionUpdate.downloadUrl || "#";
}

$("checkUpdate").addEventListener("click", async () => {
  $("checkUpdate").disabled = true;
  await chrome.runtime.sendMessage({ type: "CHECK_UPDATE" });
  await new Promise((r) => setTimeout(r, 400));
  await renderUpdate();
  $("checkUpdate").disabled = false;
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
      li.innerHTML = `
        <strong></strong>
        <span></span>
        <span></span>
      `;
      li.querySelector("strong").textContent = lead.full_name || "Untitled";
      li.querySelectorAll("span")[0].textContent = [lead.job_title, company]
        .filter(Boolean)
        .join(" · ") || "No title";
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

loadSettings()
  .then(renderUpdate)
  .then(searchLeads)
  .catch(() => {});
