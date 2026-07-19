(() => {
  let lastFingerprint = "";
  let scanTimer = null;

  function parseOpenEmail() {
    const main =
      document.querySelector('[role="main"]') ||
      document.querySelector(".AO") ||
      document.body;

    const subject =
      SecureCRM.text(main.querySelector("h2.hP")) ||
      SecureCRM.text(main.querySelector("[data-thread-perm-id] h2")) ||
      SecureCRM.text(main.querySelector("h2[data-thread-perm-id]")) ||
      "";

    const fromNode =
      main.querySelector("span.gD[email]") ||
      main.querySelector("span[email].gD") ||
      main.querySelector(".gD[name]") ||
      main.querySelector(".gD");

    const email =
      fromNode?.getAttribute("email") ||
      fromNode?.getAttribute("data-hovercard-id") ||
      "";
    const fullName =
      fromNode?.getAttribute("name") ||
      SecureCRM.text(fromNode) ||
      "";

    let companyName = null;
    if (email && email.includes("@")) {
      const domain = email.split("@")[1] || "";
      if (domain && !/(gmail|yahoo|hotmail|outlook|icloud|googlemail)\./i.test(domain)) {
        companyName = domain.split(".")[0];
      }
    }

    const bodyText =
      SecureCRM.text(main.querySelector(".a3s")) ||
      SecureCRM.text(main.querySelector("[data-message-id]")) ||
      "";
    const linkedinMatch = bodyText.match(
      /https?:\/\/([\w.-]*\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/i,
    );

    return {
      fullName: fullName || null,
      email: email || null,
      companyName,
      linkedinUrl: linkedinMatch ? linkedinMatch[0] : null,
      subject,
    };
  }

  function fingerprint(person) {
    return [
      person.email || "",
      person.fullName || "",
      person.subject || "",
      person.linkedinUrl || "",
    ].join("|");
  }

  async function runMatch({ silentEmpty = false } = {}) {
    const person = parseOpenEmail();
    if (!person.fullName && !person.email && !person.linkedinUrl) {
      if (!silentEmpty) {
        SecureCRMPanel.setStatus("Open an email first — no sender detected.");
      }
      return;
    }

    const fp = fingerprint(person);
    SecureCRMPanel.setStatus(
      `Scanning ${person.fullName || person.email || "contact"}…`,
    );

    try {
      const res = await SecureCRM.matchPerson({
        fullName: person.fullName,
        email: person.email,
        companyName: person.companyName,
        linkedinUrl: person.linkedinUrl,
      });

      lastFingerprint = fp;

      if (res.closeMatch && res.best) {
        const b = res.best;
        SecureCRMPanel.showPanel(
          `Match (${b.score})\n${b.entity_type.toUpperCase()}: ${b.full_name}\n${b.job_title || ""}\n${b.company_name || b.email || ""}`,
          [
            {
              label: "Dismiss",
              onClick: () => SecureCRMPanel.setStatus("Match dismissed."),
            },
            {
              label: "Rescan",
              onClick: () => runMatch(),
            },
          ],
        );
        return;
      }

      SecureCRMPanel.showPanel(
        `No close CRM match for:\n${person.fullName || "(no name)"}\n${person.email || ""}\n${person.companyName || ""}`,
        [
          {
            label: "Add to lead list",
            primary: true,
            onClick: async () => {
              try {
                const draft = {
                  linkedinUrl: person.linkedinUrl
                    ? SecureCRM.normalizeLinkedIn(person.linkedinUrl)
                    : "",
                  fullName: person.fullName || person.email || "",
                  jobTitle: null,
                  companyName: person.companyName,
                  industry: null,
                  website: person.email?.includes("@")
                    ? `https://${person.email.split("@")[1]}`
                    : null,
                  location: null,
                  headline: person.subject || null,
                  metadata: {
                    gmail_email: person.email,
                    subject: person.subject,
                  },
                };
                const filled = await SecureCRMForm.showLeadForm(draft);
                if (!filled) return;
                const out = await SecureCRM.captureLeads({
                  source: "gmail",
                  sourceUrl: location.href,
                  leads: [filled],
                });
                SecureCRMPanel.setStatus(
                  `Lead ${out.created ? "created" : "updated"} from Gmail.`,
                );
              } catch (e) {
                SecureCRMPanel.setStatus(e.message);
              }
            },
          },
          {
            label: "Rescan",
            onClick: () => runMatch(),
          },
        ],
      );
    } catch (e) {
      SecureCRMPanel.setStatus(e.message);
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(async () => {
      const cfg = await SecureCRM.getConfig();
      if (!cfg.autoScanGmail) return;
      const person = parseOpenEmail();
      if (!person.fullName && !person.email && !person.linkedinUrl) return;
      const fp = fingerprint(person);
      if (fp === lastFingerprint) return;
      runMatch({ silentEmpty: true });
    }, 450);
  }

  async function mount() {
    document.getElementById("scrm-float-gmail")?.remove();
    await SecureCRMFAB.mount(
      [
        {
          id: "match",
          label: "Match to CRM",
          primary: true,
          onClick: () => runMatch(),
        },
        {
          id: "rescan",
          label: "Rescan thread",
          onClick: () => {
            lastFingerprint = "";
            runMatch();
          },
        },
      ],
      { title: "SecureCRM · Gmail" },
    );
  }

  mount();
  scheduleScan();

  new MutationObserver(() => {
    if (!document.getElementById("scrm-fab-root")) mount();
    scheduleScan();
  }).observe(document.documentElement, { childList: true, subtree: true });

  // Hash / history changes when switching threads
  window.addEventListener("hashchange", () => {
    lastFingerprint = "";
    scheduleScan();
  });
  setInterval(() => scheduleScan(), 1200);
})();
