(() => {
  const FIELDS = [
    { key: "fullName", label: "Full name", required: true },
    { key: "email", label: "Email", required: false },
    { key: "linkedinUrl", label: "LinkedIn URL", required: false },
    { key: "jobTitle", label: "Job title", required: false },
    { key: "companyName", label: "Company", required: false },
    { key: "industry", label: "Industry", required: false },
    { key: "website", label: "Website", required: false },
    { key: "location", label: "Location", required: false },
  ];

  function missingKeys(lead) {
    const hard = [];
    const soft = [];
    for (const f of FIELDS) {
      const val = lead?.[f.key];
      const empty = val == null || String(val).trim() === "";
      if (f.required && empty) hard.push(f.key);
      else if (!f.required && empty && ["jobTitle", "companyName"].includes(f.key)) {
        soft.push(f.key);
      }
    }
    const hasIdentity =
      (lead?.linkedinUrl && String(lead.linkedinUrl).trim()) ||
      (lead?.email && String(lead.email).trim()) ||
      (lead?.metadata?.gmail_email && String(lead.metadata.gmail_email).trim());
    if (!hasIdentity) hard.push("email/linkedin");
    return { hard, soft };
  }

  function ensureFormRoot() {
    let root = document.getElementById("securecrm-form");
    if (root) return root;
    root = document.createElement("div");
    root.id = "securecrm-form";
    root.innerHTML = `
      <div class="scrm-form-card">
        <div class="scrm-head">
          <strong>Complete lead fields</strong>
          <button type="button" id="scrm-form-close" aria-label="Close">×</button>
        </div>
        <p class="scrm-form-hint" id="scrm-form-hint"></p>
        <form id="scrm-form-fields" class="scrm-form-fields"></form>
        <div class="scrm-actions">
          <button type="button" class="scrm-btn" id="scrm-form-cancel">Cancel</button>
          <button type="button" class="scrm-btn scrm-btn-primary" id="scrm-form-save">Save to CRM</button>
        </div>
      </div>
    `;
    document.documentElement.appendChild(root);
    return root;
  }

  function hideForm() {
    document.getElementById("securecrm-form")?.classList.remove("scrm-open");
  }

  function showLeadForm(lead) {
    return new Promise((resolve) => {
      const root = ensureFormRoot();
      const hint = root.querySelector("#scrm-form-hint");
      const form = root.querySelector("#scrm-form-fields");
      const { hard, soft } = missingKeys(lead);
      const highlight = new Set(hard.length ? hard : soft);

      hint.textContent = hard.length
        ? `Missing required: ${hard.join(", ")}.`
        : soft.length
          ? `Empty optional fields: ${soft.join(", ")}. Confirm then save.`
          : "Review fields, then save.";

      form.innerHTML = "";
      for (const f of FIELDS) {
        const label = document.createElement("label");
        label.className = highlight.has(f.key)
          ? "scrm-field scrm-field-miss"
          : "scrm-field";
        const span = document.createElement("span");
        span.textContent = `${f.label}${f.required ? " *" : ""}`;
        const input = document.createElement("input");
        input.name = f.key;
        input.value = lead?.[f.key] != null ? String(lead[f.key]) : "";
        input.required = f.required;
        input.autocomplete = "off";
        label.appendChild(span);
        label.appendChild(input);
        form.appendChild(label);
      }

      root.classList.add("scrm-open");
      const saveBtn = root.querySelector("#scrm-form-save");
      const cancelBtn = root.querySelector("#scrm-form-cancel");
      const closeBtn = root.querySelector("#scrm-form-close");

      const cleanup = (value) => {
        saveBtn.onclick = null;
        cancelBtn.onclick = null;
        closeBtn.onclick = null;
        hideForm();
        resolve(value);
      };

      cancelBtn.onclick = () => cleanup(null);
      closeBtn.onclick = () => cleanup(null);
      saveBtn.onclick = () => {
        const data = {
          ...lead,
          metadata: { ...(lead?.metadata || {}), completed_via_form: true },
        };
        for (const f of FIELDS) {
          const input = form.querySelector(`[name="${f.key}"]`);
          data[f.key] = input?.value?.trim() || null;
        }
        if (!data.fullName) {
          hint.textContent = "Full name is required.";
          return;
        }
        if (!data.linkedinUrl && !data.email) {
          hint.textContent = "Email or LinkedIn URL is required.";
          return;
        }
        if (data.linkedinUrl) {
          data.linkedinUrl = SecureCRM.normalizeLinkedIn(data.linkedinUrl);
        }
        cleanup(data);
      };
    });
  }

  async function captureManyWithForm(source, sourceUrl, leads, batchOpts = {}) {
    const ready = [];
    const needsForm = [];
    for (const lead of leads) {
      const { hard } = missingKeys(lead);
      if (hard.length) needsForm.push(lead);
      else ready.push(lead);
    }

    let created = 0;
    let updated = 0;
    let batchId = batchOpts.batchId || null;
    let lastIndex = -1;
    const queue = [];

    for (const lead of ready) queue.push({ lead, auto: true });
    for (const lead of needsForm) queue.push({ lead, auto: false });

    for (let i = 0; i < queue.length; i += 1) {
      const item = queue[i];
      let lead = item.lead;
      if (!item.auto) {
        lead = await showLeadForm(lead);
        if (!lead) continue;
      }
      const isLast = i === queue.length - 1;
      const res = await SecureCRM.captureLeads({
        source,
        sourceUrl,
        batchId,
        startBatch: !batchId,
        finishBatch: Boolean(batchOpts.finishBatch && isLast),
        leads: [lead],
      });
      batchId = res.batchId;
      created += res.created;
      updated += res.updated;
      lastIndex = i;
    }

    if (batchId && batchOpts.finishBatch && lastIndex < queue.length - 1) {
      await SecureCRM.captureLeads({
        source,
        sourceUrl,
        batchId,
        finishBatch: true,
        leads: [],
      });
    }

    return {
      batchId,
      created,
      updated,
      captured: created + updated,
      skippedForm: needsForm.length,
    };
  }

  window.SecureCRMForm = {
    missingKeys,
    showLeadForm,
    captureManyWithForm,
    hideForm,
  };
})();
