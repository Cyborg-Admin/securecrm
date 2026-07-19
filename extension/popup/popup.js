const status = document.getElementById("status");
const local = chrome.runtime.getManifest().version;
status.textContent = `Installed v${local}`;

chrome.storage.local.get(["extensionUpdate"], (data) => {
  const u = data.extensionUpdate;
  if (u?.updateAvailable) {
    status.textContent = `Update available: v${u.remoteVersion} (you have v${local})`;
  }
});
