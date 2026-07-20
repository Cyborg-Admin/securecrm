const statusEl = document.getElementById("status");
const detailEl = document.getElementById("detail");
const actionsEl = document.getElementById("actions");

function setStatus(text, tone) {
  statusEl.textContent = text;
  if (tone) statusEl.dataset.tone = tone;
  else delete statusEl.dataset.tone;
}

function showActions(show) {
  actionsEl.hidden = !show;
}

async function run() {
  showActions(false);
  const local = chrome.runtime.getManifest().version;
  detailEl.textContent = `Installed v${local}. Applying the latest pack from your CRM…`;

  // Prefer Chrome's own updater when this build is store/enterprise installed
  const installType = await KineticAutoUpdate.getInstallType();
  if (installType === "normal" || installType === "admin") {
    setStatus("Checking Chrome update channel…");
    const check = await KineticAutoUpdate.tryChromeStoreUpdate();
    if (check.status === "update_available") {
      setStatus("Update downloaded — reloading…", "ok");
      return;
    }
  }

  const result = await KineticAutoUpdate.applyFolderUpdate({ force: false });
  if (result.applied) {
    setStatus(`Updated to v${result.version}. Reloading…`, "ok");
    return;
  }

  if (result.reason === "already_current") {
    setStatus(`Already on v${result.version}.`, "ok");
    showActions(true);
    return;
  }

  if (result.reason === "not_linked" || result.reason === "invalid_folder") {
    setStatus(
      "One-time setup needed: link the unpacked extension folder for automatic updates.",
      "warn",
    );
    detailEl.textContent =
      "Choose the same folder you used in chrome://extensions → Load unpacked.";
    showActions(true);
    return;
  }

  if (result.reason === "permission_denied") {
    setStatus("Folder permission needed to write the update.", "warn");
    showActions(true);
    return;
  }

  setStatus(result.reason || "Update could not be applied.", "warn");
  showActions(true);
}

document.getElementById("linkFolder").addEventListener("click", async () => {
  try {
    setStatus("Select the KINETIC extension folder…");
    await KineticAutoUpdate.linkExtensionFolder();
    setStatus("Folder linked. Applying update…", "ok");
    await KineticAutoUpdate.applyFolderUpdate({ force: true });
  } catch (e) {
    setStatus(e.message || "Could not link folder", "warn");
    showActions(true);
  }
});

document.getElementById("retry").addEventListener("click", () => {
  run().catch((e) => {
    setStatus(e.message || "Update failed", "warn");
    showActions(true);
  });
});

document.getElementById("close").addEventListener("click", () => {
  window.close();
});

run().catch((e) => {
  setStatus(e.message || "Update failed", "warn");
  showActions(true);
});
