(() => {
  let active = false;
  let overlay = null;
  let hoverEl = null;

  const FIELDS = [
    { id: "fullName", label: "Full name" },
    { id: "jobTitle", label: "Job title" },
    { id: "companyName", label: "Company" },
    { id: "location", label: "Location" },
    { id: "headline", label: "Headline" },
    { id: "experienceRoot", label: "Experience section root" },
  ];

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "scrm-train-overlay";
    overlay.innerHTML = `
      <div class="scrm-train-bar">
        <strong>Train mode</strong>
        <span>Click an element, then pick the field.</span>
        <button type="button" id="scrm-train-stop">Stop</button>
      </div>
      <div class="scrm-train-picker" id="scrm-train-picker" hidden></div>
    `;
    document.documentElement.appendChild(overlay);
    overlay.querySelector("#scrm-train-stop").onclick = () => stop();
    const picker = overlay.querySelector("#scrm-train-picker");
    for (const f of FIELDS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = f.label;
      btn.dataset.field = f.id;
      picker.appendChild(btn);
    }
    return overlay;
  }

  function onMove(e) {
    if (!active) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || overlay.contains(el)) return;
    if (hoverEl === el) return;
    hoverEl?.classList.remove("scrm-train-hover");
    hoverEl = el;
    hoverEl.classList.add("scrm-train-hover");
  }

  async function onClick(e) {
    if (!active) return;
    if (overlay.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    const el = hoverEl || e.target;
    if (!(el instanceof Element)) return;
    const css = SecureCRMRecipe.buildCssPath(el);
    const picker = overlay.querySelector("#scrm-train-picker");
    picker.hidden = false;
    picker.onclick = async (ev) => {
      const btn = ev.target.closest("button[data-field]");
      if (!btn) return;
      const field = btn.dataset.field;
      try {
        SecureCRMPanel.setStatus(`Saving ${field} → ${css.slice(0, 80)}…`);
        await SecureCRMRecipe.saveFields("linkedin", {
          [field]: { css, note: "trained" },
        });
        SecureCRMPanel.setStatus(`Trained ${field}.`);
        picker.hidden = true;
      } catch (err) {
        SecureCRMPanel.setStatus(err.message || "Train save failed");
      }
    };
  }

  function start() {
    active = true;
    ensureOverlay();
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    SecureCRMPanel.setStatus("Train mode on — click a page element.");
  }

  function stop() {
    active = false;
    hoverEl?.classList.remove("scrm-train-hover");
    hoverEl = null;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    overlay?.remove();
    overlay = null;
    SecureCRMPanel.setStatus("Train mode off.");
  }

  function toggle() {
    if (active) stop();
    else start();
  }

  chrome.storage.sync.get(["trainMode"], (data) => {
    if (data.trainMode) start();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes.trainMode) return;
    if (changes.trainMode.newValue) start();
    else stop();
  });

  window.SecureCRMTrain = { start, stop, toggle, isActive: () => active };
})();
