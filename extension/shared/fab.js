(() => {
  const ROOT_ID = "scrm-fab-root";

  function remove() {
    document.getElementById(ROOT_ID)?.remove();
  }

  /**
   * @param {Array<{ id: string, label: string, primary?: boolean, onClick: () => void }>} actions
   * @param {{ title?: string }} [opts]
   */
  async function mount(actions, opts = {}) {
    const cfg = await SecureCRM.getConfig();
    if (!cfg.showFab) {
      remove();
      return null;
    }

    remove();
    const root = document.createElement("div");
    root.id = ROOT_ID;
    root.className = "scrm-fab-root";
    root.innerHTML = `
      <div class="scrm-fab-menu" id="scrm-fab-menu" hidden></div>
      <button type="button" class="scrm-fab-main" id="scrm-fab-toggle" aria-label="KINETIC actions" title="${opts.title || "KINETIC"}">
        <span class="scrm-fab-mark">S</span>
      </button>
    `;
    document.documentElement.appendChild(root);

    const menu = root.querySelector("#scrm-fab-menu");
    for (const action of actions) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = action.primary
        ? "scrm-fab-item scrm-fab-item-primary"
        : "scrm-fab-item";
      btn.dataset.id = action.id;
      btn.textContent = action.label;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        menu.hidden = true;
        try {
          action.onClick?.();
        } catch (err) {
          SecureCRMPanel?.setStatus?.(err.message || "Action failed");
        }
      });
      menu.appendChild(btn);
    }

    const statusBtn = document.createElement("button");
    statusBtn.type = "button";
    statusBtn.className = "scrm-fab-item";
    statusBtn.textContent = "Open side panel";
    statusBtn.addEventListener("click", () => {
      menu.hidden = true;
      chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
    });
    menu.appendChild(statusBtn);

    root.querySelector("#scrm-fab-toggle").addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });

    document.addEventListener(
      "click",
      (e) => {
        if (!root.contains(e.target)) menu.hidden = true;
      },
      true,
    );

    return root;
  }

  window.SecureCRMFAB = { mount, remove };
})();
