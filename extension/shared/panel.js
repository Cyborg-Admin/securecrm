(() => {
  function ensurePanel() {
    let root = document.getElementById("securecrm-panel");
    if (root) return root;

    root = document.createElement("div");
    root.id = "securecrm-panel";
    root.innerHTML = `
      <div class="scrm-card">
        <div class="scrm-head">
          <strong>KINETIC</strong>
          <button type="button" id="scrm-close" aria-label="Close">×</button>
        </div>
        <div id="scrm-body" class="scrm-body">Ready.</div>
        <div class="scrm-actions" id="scrm-actions"></div>
      </div>
    `;
    document.documentElement.appendChild(root);
    root.querySelector("#scrm-close").addEventListener("click", () => {
      root.classList.remove("scrm-open");
    });
    return root;
  }

  function showPanel(message, actions = []) {
    const root = ensurePanel();
    root.classList.add("scrm-open");
    root.querySelector("#scrm-body").innerHTML = message;
    const actionsEl = root.querySelector("#scrm-actions");
    actionsEl.innerHTML = "";
    for (const action of actions) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = action.primary ? "scrm-btn scrm-btn-primary" : "scrm-btn";
      btn.textContent = action.label;
      btn.addEventListener("click", () => action.onClick?.());
      actionsEl.appendChild(btn);
    }
  }

  function setStatus(message) {
    const root = ensurePanel();
    root.classList.add("scrm-open");
    root.querySelector("#scrm-body").textContent = message;
  }

  window.SecureCRMPanel = { ensurePanel, showPanel, setStatus };
})();
