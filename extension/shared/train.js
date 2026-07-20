(() => {
  let active = false;
  let overlay = null;
  let hoverEl = null;
  let selectedEl = null;
  let selectedCss = "";
  let selectedPreview = "";
  let starting = false;
  let ignoreStorage = false;

  const FIELDS = [
    { id: "fullName", label: "Full name" },
    { id: "jobTitle", label: "Job title" },
    { id: "companyName", label: "Company" },
    { id: "location", label: "Location" },
    { id: "connectionCount", label: "Connection count" },
    { id: "experienceRoot", label: "Experience section" },
  ];

  function withStorageQuiet(fn) {
    ignoreStorage = true;
    try {
      fn();
    } finally {
      setTimeout(() => {
        ignoreStorage = false;
      }, 400);
    }
  }

  function setTrainStorage(on) {
    withStorageQuiet(() => {
      chrome.storage.sync.set({ trainMode: Boolean(on) });
    });
  }

  function status(message) {
    try {
      SecureCRMPanel?.setStatus?.(message);
    } catch {
      /* optional */
    }
    const el = overlay?.querySelector("#scrm-train-status");
    if (el) el.textContent = message;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isOurUi(node) {
    if (!(node instanceof Element)) return false;
    return Boolean(
      node.closest?.(
        "#scrm-train-overlay, #securecrm-panel, #scrm-fab-root, #securecrm-form",
      ),
    );
  }

  function clearSelection() {
    selectedEl?.classList.remove("scrm-train-selected-el");
    selectedEl = null;
    selectedCss = "";
    selectedPreview = "";
    const box = overlay?.querySelector("#scrm-train-selected");
    const picker = overlay?.querySelector("#scrm-train-picker");
    if (box) {
      box.hidden = true;
      box.textContent = "";
    }
    if (picker) picker.hidden = true;
  }

  function ensureOverlay() {
    if (overlay && document.documentElement.contains(overlay)) return overlay;
    overlay = document.createElement("div");
    overlay.id = "scrm-train-overlay";
    overlay.innerHTML = `
      <div class="scrm-train-bar">
        <div class="scrm-train-bar-text">
          <strong>Train mode</strong>
          <span id="scrm-train-status">Click a page element, then pick the field.</span>
        </div>
        <button type="button" id="scrm-train-stop">Stop</button>
      </div>
      <div class="scrm-train-selected" id="scrm-train-selected" hidden></div>
      <div class="scrm-train-picker" id="scrm-train-picker" hidden></div>
    `;
    document.documentElement.appendChild(overlay);

    overlay.querySelector("#scrm-train-stop").addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      stop({ persist: true });
    });

    const picker = overlay.querySelector("#scrm-train-picker");
    for (const f of FIELDS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = f.label;
      btn.dataset.field = f.id;
      picker.appendChild(btn);
    }

    picker.addEventListener("click", async (ev) => {
      const btn = ev.target.closest("button[data-field]");
      if (!btn || !selectedCss) return;
      ev.preventDefault();
      ev.stopPropagation();
      const field = btn.dataset.field;
      const source = SecureCRMRecipe?.detectSource?.() || "linkedin";
      try {
        status(`Saving ${field}…`);
        const cfg = await SecureCRM.getConfig();
        if (!cfg.apiKey) {
          throw new Error("Set your API key in the KINETIC side panel first.");
        }
        await SecureCRMRecipe.saveFields(source, {
          [field]: {
            css: selectedCss,
            note: selectedPreview.slice(0, 120) || "trained",
          },
        });
        status(`Saved “${field}” for ${source}. Click another element or Stop.`);
        clearSelection();
      } catch (err) {
        status(err.message || "Train save failed");
      }
    });

    return overlay;
  }

  function onMove(e) {
    if (!active) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!(el instanceof Element) || isOurUi(el)) return;
    if (hoverEl === el) return;
    if (hoverEl && hoverEl !== selectedEl) {
      hoverEl.classList.remove("scrm-train-hover");
    }
    hoverEl = el;
    if (hoverEl !== selectedEl) hoverEl.classList.add("scrm-train-hover");
  }

  function onClick(e) {
    if (!active) return;
    if (isOurUi(e.target)) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const el =
      (hoverEl instanceof Element && !isOurUi(hoverEl) && hoverEl) ||
      (e.target instanceof Element ? e.target : null);
    if (!el) return;

    const css = SecureCRMRecipe.buildCssPath(el);
    if (!css) {
      status("Could not build a selector. Try clicking the text itself.");
      return;
    }

    selectedEl?.classList.remove("scrm-train-selected-el");
    selectedEl = el;
    selectedEl.classList.add("scrm-train-selected-el");
    selectedCss = css;
    selectedPreview = SecureCRM.text(el).slice(0, 160);

    const box = overlay.querySelector("#scrm-train-selected");
    const picker = overlay.querySelector("#scrm-train-picker");
    box.hidden = false;
    box.innerHTML = `<div class="scrm-train-preview">${escapeHtml(
      selectedPreview || "(empty text)",
    )}</div><code>${escapeHtml(css)}</code>`;
    picker.hidden = false;
    status("Element selected — choose which field it maps to.");
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === "Escape") {
      if (selectedCss) clearSelection();
      else stop({ persist: true });
    }
  }

  async function start({ persist = true } = {}) {
    if (active || starting) return;
    starting = true;
    try {
      const cfg = await SecureCRM.getConfig();
      ensureOverlay();
      active = true;
      if (persist) setTrainStorage(true);
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("click", onClick, true);
      document.addEventListener("keydown", onKey, true);
      document.documentElement.classList.add("scrm-train-active");
      status(
        cfg.apiKey
          ? "Train mode on — click a name, title, or company on the page."
          : "Train mode on — set your API key in the side panel before saving.",
      );
    } finally {
      starting = false;
    }
  }

  function stop({ persist = true } = {}) {
    if (!active && !overlay) {
      if (persist) setTrainStorage(false);
      return;
    }
    active = false;
    starting = false;
    if (hoverEl && hoverEl !== selectedEl) {
      hoverEl.classList.remove("scrm-train-hover");
    }
    hoverEl = null;
    clearSelection();
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    document.documentElement.classList.remove("scrm-train-active");
    overlay?.remove();
    overlay = null;
    if (persist) setTrainStorage(false);
    try {
      SecureCRMPanel?.setStatus?.("Train mode off.");
    } catch {
      /* ignore */
    }
  }

  async function toggle() {
    if (active) {
      stop({ persist: true });
      return false;
    }
    await start({ persist: true });
    return true;
  }

  chrome.storage.sync.get(["trainMode"], (data) => {
    if (data.trainMode) {
      setTimeout(() => {
        void start({ persist: false });
      }, 80);
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.trainMode || ignoreStorage) return;
    if (changes.trainMode.newValue) void start({ persist: false });
    else stop({ persist: false });
  });

  window.SecureCRMTrain = { start, stop, toggle, isActive: () => active };
})();
