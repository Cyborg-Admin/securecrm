(() => {
  const IDB_NAME = "kinetic-auto-update";
  const IDB_STORE = "handles";
  const HANDLE_KEY = "extensionDir";

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IDB open failed"));
    });
  }

  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function idbDelete(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getDirHandle() {
    return idbGet(HANDLE_KEY);
  }

  async function saveDirHandle(handle) {
    await idbSet(HANDLE_KEY, handle);
    await chrome.storage.local.set({
      autoUpdateEnabled: true,
      autoUpdateFolderLinkedAt: new Date().toISOString(),
    });
  }

  async function clearDirHandle() {
    await idbDelete(HANDLE_KEY);
    await chrome.storage.local.set({
      autoUpdateEnabled: false,
      autoUpdateFolderLinkedAt: null,
    });
  }

  async function ensurePermission(handle, mode = "readwrite") {
    if (!handle) return false;
    const opts = { mode };
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if ((await handle.requestPermission(opts)) === "granted") return true;
    return false;
  }

  async function readManifestFromDir(handle) {
    const fh = await handle.getFileHandle("manifest.json");
    const file = await fh.getFile();
    return JSON.parse(await file.text());
  }

  async function verifyExtensionDir(handle) {
    try {
      const manifest = await readManifestFromDir(handle);
      const name = String(manifest.name || "");
      return /kinetic|securecrm/i.test(name) && Boolean(manifest.manifest_version);
    } catch {
      return false;
    }
  }

  async function linkExtensionFolder() {
    if (typeof showDirectoryPicker !== "function") {
      throw new Error("This Chrome build cannot link a folder for auto-updates.");
    }
    const handle = await showDirectoryPicker({ mode: "readwrite" });
    const ok = await verifyExtensionDir(handle);
    if (!ok) {
      throw new Error(
        "Pick the extension folder that contains manifest.json (KINETIC Lead Capture).",
      );
    }
    await saveDirHandle(handle);
    return handle;
  }

  async function fetchSourcePack() {
    const { apiBase } = await chrome.storage.sync.get(["apiBase"]);
    const base = (apiBase || "https://crm.cyborgwales.com").replace(/\/$/, "");
    const res = await fetch(`${base}/api/extension/sources`, {
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Sources ${res.status}`);
    if (!json?.files || !json?.version) {
      throw new Error("Invalid extension pack from server");
    }
    return json;
  }

  function decodeEntry(entry) {
    if (entry.encoding === "base64") {
      const bin = atob(entry.content);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    return entry.content;
  }

  async function writePackToDir(dirHandle, pack) {
    const entries = Object.entries(pack.files || {});
    for (const [relPath, entry] of entries) {
      const parts = relPath.split("/").filter(Boolean);
      if (!parts.length) continue;
      let dir = dirHandle;
      for (let i = 0; i < parts.length - 1; i++) {
        dir = await dir.getDirectoryHandle(parts[i], { create: true });
      }
      const fileHandle = await dir.getFileHandle(parts[parts.length - 1], {
        create: true,
      });
      const writable = await fileHandle.createWritable();
      await writable.write(decodeEntry(entry));
      await writable.close();
    }
  }

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
      if (!chrome.management?.getSelf) return "unknown";
      const self = await chrome.management.getSelf();
      return self.installType || "unknown";
    } catch {
      return "unknown";
    }
  }

  /**
   * Apply server pack to linked unpacked folder, then reload.
   * Returns { applied, version, reason }.
   */
  async function applyFolderUpdate({ force = false } = {}) {
    const handle = await getDirHandle();
    if (!handle) {
      return { applied: false, reason: "not_linked" };
    }
    const permitted = await ensurePermission(handle, "readwrite");
    if (!permitted) {
      return { applied: false, reason: "permission_denied" };
    }
    if (!(await verifyExtensionDir(handle))) {
      await clearDirHandle();
      return { applied: false, reason: "invalid_folder" };
    }

    const localManifest = chrome.runtime.getManifest();
    const pack = await fetchSourcePack();
    if (!force && compareVersions(pack.version, localManifest.version) <= 0) {
      return {
        applied: false,
        reason: "already_current",
        version: pack.version,
      };
    }

    await writePackToDir(handle, pack);
    await chrome.storage.local.set({
      extensionUpdate: {
        localVersion: pack.version,
        remoteVersion: pack.version,
        updateAvailable: false,
        releaseNotes: "",
        checkedAt: new Date().toISOString(),
        lastAppliedVersion: pack.version,
        lastAppliedAt: new Date().toISOString(),
      },
      pendingAutoUpdate: false,
    });
    chrome.action.setBadgeText({ text: "" });

    // Reload picks up newly written files for unpacked installs
    setTimeout(() => chrome.runtime.reload(), 250);
    return { applied: true, version: pack.version, reason: "applied" };
  }

  async function tryChromeStoreUpdate() {
    try {
      const result = await chrome.runtime.requestUpdateCheck();
      return result;
    } catch (e) {
      return { status: "error", error: e?.message || String(e) };
    }
  }

  window.KineticAutoUpdate = {
    linkExtensionFolder,
    clearDirHandle,
    getDirHandle,
    ensurePermission,
    verifyExtensionDir,
    fetchSourcePack,
    applyFolderUpdate,
    tryChromeStoreUpdate,
    compareVersions,
    getInstallType,
  };
})();
