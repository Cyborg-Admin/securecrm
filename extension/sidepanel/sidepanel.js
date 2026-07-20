const $ = (id) => document.getElementById(id);

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    $(`tab-${tab.dataset.tab}`).classList.add("active");
    if (tab.dataset.tab === "history") renderHistory();
    if (tab.dataset.tab === "crm") {
      refreshPageContext();
      searchLeads();
    }
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
  $("settingsStatus").textContent = "Saved. Reload LinkedIn / Cognism tabs for FAB & badges.";
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

/** @type {{ person: object|null, matchResult: object|null, site: string|null, fingerprint: string }} */
let pageState = { person: null, matchResult: null, site: null, fingerprint: "" };
let contextRefreshTimer = null;
let lastMatchedFingerprint = "";

function clearNbaActions() {
  const box = $("nbaActions");
  if (box) box.innerHTML = "";
}

function addNbaButton(label, onClick, primary = false) {
  const box = $("nbaActions");
  if (!box) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = primary ? "primary nba-btn" : "ghost nba-btn";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  box.appendChild(btn);
}

async function openCrmRecord(entityType, id) {
  const cfg = await SecureCRM.getConfig();
  const path =
    entityType === "contact" ? `/contacts?open=${id}` : `/leads?open=${id}`;
  chrome.tabs.create({ url: `${cfg.apiBase}${path}` });
}

function personToLeadPayload(person) {
  const email = person.email || null;
  return {
    fullName: person.fullName || email || "Unknown",
    email,
    jobTitle: person.jobTitle || null,
    companyName: person.companyName || null,
    website: person.website || null,
    linkedinUrl: person.linkedinUrl || null,
    metadata: {
      gmail_email: email,
      phone: person.phone || null,
      subject: person.subject || null,
      signature_scanned: true,
      to_emails: person.toEmails || [],
      external_thread_id: person.externalThreadId || null,
      external_message_id: person.externalMessageId || null,
    },
  };
}

function renderPersonCard(person) {
  const card = $("personCard");
  if (!person) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  $("personName").textContent = person.fullName || person.email || "Unknown sender";
  $("personTitle").textContent = [person.jobTitle, person.companyName]
    .filter(Boolean)
    .join(" · ");
  const bits = [person.email, person.phone, person.website, person.linkedinUrl].filter(
    Boolean,
  );
  $("personDetails").textContent = bits.join(" · ");
  $("personSubject").textContent = person.subject
    ? `Subject: ${person.subject}`
    : "";
}

function renderMatches(matchResult) {
  const list = $("matchList");
  const empty = $("matchEmpty");
  list.innerHTML = "";
  const matches = matchResult?.matches || [];
  empty.hidden = matches.length > 0;
  if (!matches.length) {
    empty.textContent = pageState.person
      ? "No close CRM match — capture as a new lead."
      : "Open a Gmail thread to match contacts and leads.";
    return;
  }
  for (const m of matches.slice(0, 5)) {
    const li = document.createElement("li");
    li.className = "match-item";
    const type = m.entity_type === "contact" ? "Contact" : "Lead";
    li.innerHTML = `<strong></strong><span></span><span></span>`;
    li.querySelector("strong").textContent = `${m.full_name || "Untitled"} · ${type}`;
    li.querySelectorAll("span")[0].textContent =
      [m.job_title, m.company_name, m.email].filter(Boolean).join(" · ") || "—";
    li.querySelectorAll("span")[1].textContent = `Match ${m.score}% · ${(m.reasons || []).join(", ")}`;
    li.addEventListener("click", () => openCrmRecord(m.entity_type, m.id));
    list.appendChild(li);
  }
}

function renderNba() {
  clearNbaActions();
  const copy = $("nbaCopy");
  const captureBtn = $("captureLeadBtn");
  captureBtn.hidden = true;

  SecureCRM.isSignedIn().then((signedIn) => {
    if (!signedIn) {
      copy.textContent = "Sign in under Settings to match and capture from Gmail.";
      addNbaButton("Go to Settings", () => {
        document.querySelector('.tab[data-tab="settings"]')?.click();
      }, true);
      return;
    }

    const person = pageState.person;
    if (!person) {
      copy.textContent =
        "Open a Gmail conversation. Kinetic scans the signature for name, title, company, email, phone, and LinkedIn.";
      return;
    }

    const hasIdentity = Boolean(person.email || person.linkedinUrl);
    const best = pageState.matchResult?.best;
    const close = Boolean(pageState.matchResult?.closeMatch && best);

    if (!hasIdentity) {
      copy.textContent =
        "Signature scan found a person but no email or LinkedIn URL — add those before capturing.";
      return;
    }

    if (close) {
      const type = best.entity_type === "contact" ? "contact" : "lead";
      const gaps = [];
      if (person.phone && type === "contact") gaps.push("phone on file");
      if (person.jobTitle && !best.job_title) gaps.push("job title");
      if (person.companyName && !best.company_name) gaps.push("company");
      copy.textContent = gaps.length
        ? `Recognised ${type}: ${best.full_name}. Next: open the record and fill ${gaps.join(", ")} from the signature.`
        : `Recognised ${type}: ${best.full_name}. Next: open the record or continue the conversation in CRM.`;
      addNbaButton(
        `Open ${type}`,
        () => openCrmRecord(best.entity_type, best.id),
        true,
      );
      if (pageState.matchResult?.suggestAddLead === false) {
        captureBtn.hidden = true;
      }
      return;
    }

    copy.textContent = `No strong match for ${person.fullName || person.email}. Next: capture as a lead from the signature details.`;
    captureBtn.hidden = false;
    addNbaButton("Capture lead", () => captureCurrentLead(), true);
  });
}

async function captureCurrentLead() {
  const status = $("contextStatus");
  const person = pageState.person;
  if (!person) {
    status.textContent = "No person detected on this page.";
    return;
  }
  if (!person.email && !person.linkedinUrl) {
    status.textContent = "Need an email or LinkedIn URL to capture.";
    return;
  }
  const btn = $("captureLeadBtn");
  btn.disabled = true;
  status.textContent = "Capturing…";
  try {
    const res = await SecureCRM.captureLeads({
      source: "gmail",
      sourceUrl: person.sourceUrl || null,
      startBatch: true,
      finishBatch: true,
      leads: [personToLeadPayload(person)],
    });
    const created = res.created || 0;
    const updated = res.updated || 0;
    status.textContent =
      created > 0
        ? `Lead created.`
        : updated > 0
          ? `Lead updated.`
          : `Captured ${res.captured || 0}.`;
    lastMatchedFingerprint = "";
    await matchCurrentPerson(person, pageState.fingerprint || "");
  } catch (e) {
    status.textContent = e.message || "Capture failed";
  } finally {
    btn.disabled = false;
  }
}

async function matchCurrentPerson(person, fingerprint = "") {
  if (!person?.email && !person?.fullName && !person?.linkedinUrl) {
    pageState.matchResult = null;
    lastMatchedFingerprint = "";
    renderMatches(null);
    renderNba();
    return;
  }
  if (fingerprint && fingerprint === lastMatchedFingerprint && pageState.matchResult) {
    renderMatches(pageState.matchResult);
    renderNba();
    return;
  }
  try {
    const matchResult = await SecureCRM.matchPerson({
      fullName: person.fullName || null,
      email: person.email || null,
      linkedinUrl: person.linkedinUrl || null,
      companyName: person.companyName || null,
      emailContext: {
        subject: person.subject || null,
        fromEmail: person.email || null,
        fromName: person.fullName || null,
        toEmails: person.toEmails || [],
        sourceUrl: person.sourceUrl || null,
        snippet: person.snippet || null,
        bodyText: person.bodyText || null,
        externalThreadId: person.externalThreadId || null,
        externalMessageId: person.externalMessageId || null,
        sentAt: person.sentAt || null,
        direction: "inbound",
      },
    });
    pageState.matchResult = matchResult;
    lastMatchedFingerprint = fingerprint || lastMatchedFingerprint;
    renderMatches(matchResult);
    renderNba();
    if (matchResult.activityLogged) {
      $("contextStatus").textContent = "Email activity logged on the matched record.";
    }
  } catch (e) {
    pageState.matchResult = null;
    lastMatchedFingerprint = "";
    renderMatches(null);
    renderNba();
    $("contextStatus").textContent = e.message || "Match failed";
  }
}

async function refreshPageContext() {
  const hint = $("contextHint");
  const status = $("contextStatus");
  try {
    let res = await chrome.runtime.sendMessage({ type: "GET_PAGE_CONTEXT" });
    let ctx = res?.context;
    if (!ctx?.person) {
      const parsed = await chrome.runtime.sendMessage({ type: "REQUEST_PAGE_PARSE" });
      if (parsed?.person) {
        ctx = {
          site: "gmail",
          person: parsed.person,
          empty: false,
        };
      }
    }

    if (!ctx?.person || ctx.empty) {
      pageState = {
        person: null,
        matchResult: null,
        site: ctx?.site || null,
        fingerprint: "",
      };
      lastMatchedFingerprint = "";
      renderPersonCard(null);
      renderMatches(null);
      renderNba();
      hint.textContent =
        "Open a Gmail thread — Kinetic reads the From header and email signature.";
      return;
    }

    const fp =
      ctx.fingerprint ||
      [ctx.person.email, ctx.person.fullName, ctx.person.externalMessageId]
        .filter(Boolean)
        .join("|");
    pageState.person = ctx.person;
    pageState.site = ctx.site || "gmail";
    pageState.fingerprint = fp;
    hint.textContent =
      ctx.site === "gmail"
        ? "Gmail thread — details from From header + signature scan."
        : `Active tab: ${ctx.site}`;
    renderPersonCard(ctx.person);
    if (fp !== lastMatchedFingerprint) {
      status.textContent = "Matching…";
    }
    await matchCurrentPerson(ctx.person, fp);
    if ($("contextStatus").textContent === "Matching…") {
      status.textContent = "";
    }
  } catch (e) {
    hint.textContent = "Could not read the active tab. Is Gmail open?";
    status.textContent = e.message || "";
    pageState = { person: null, matchResult: null, site: null, fingerprint: "" };
    lastMatchedFingerprint = "";
    renderPersonCard(null);
    renderMatches(null);
    renderNba();
  }
}

$("refreshContext")?.addEventListener("click", () => refreshPageContext());
$("captureLeadBtn")?.addEventListener("click", () => captureCurrentLead());

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "PAGE_CONTEXT_UPDATED") {
    const crmTab = $("tab-crm");
    if (!crmTab?.classList.contains("active")) return;
    clearTimeout(contextRefreshTimer);
    contextRefreshTimer = setTimeout(() => refreshPageContext(), 350);
  }
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
      li.addEventListener("click", () => openCrmRecord("lead", lead.id));
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
  .then(refreshPageContext)
  .then(searchLeads)
  .then(refreshDeepStatus)
  .catch(() => {});
