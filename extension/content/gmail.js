(() => {
  let lastFingerprint = "";
  let scanTimer = null;

  function collectEmails(nodes) {
    const out = [];
    for (const node of nodes || []) {
      const email =
        node.getAttribute?.("email") ||
        node.getAttribute?.("data-hovercard-id") ||
        "";
      if (email && email.includes("@")) out.push(email.toLowerCase());
    }
    return [...new Set(out)];
  }

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

    const toNodes = main.querySelectorAll(
      ".g2 span[email], .hb span[email], span.g2[email], [email].g2",
    );
    const ccNodes = main.querySelectorAll(
      ".gD[email], span[email]",
    );
    const toEmails = collectEmails(toNodes).filter(
      (e) => e !== String(email).toLowerCase(),
    );
    const allParticipantEmails = collectEmails(ccNodes);
    const ccEmails = allParticipantEmails.filter(
      (e) =>
        e !== String(email).toLowerCase() && !toEmails.includes(e),
    );

    let companyName = null;
    if (email && email.includes("@")) {
      const domain = email.split("@")[1] || "";
      if (
        domain &&
        !/(gmail|yahoo|hotmail|outlook|icloud|googlemail)\./i.test(domain)
      ) {
        companyName = domain.split(".")[0];
      }
    }

    const bodyEl =
      main.querySelector(".a3s.aiL") ||
      main.querySelector(".a3s") ||
      main.querySelector("[data-message-id]");
    const bodyText = SecureCRM.text(bodyEl) || "";
    const linkedinMatch = bodyText.match(
      /https?:\/\/([\w.-]*\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/i,
    );

    const threadEl =
      main.querySelector("[data-thread-perm-id]") ||
      document.querySelector("[data-thread-perm-id]");
    const externalThreadId =
      threadEl?.getAttribute("data-thread-perm-id") ||
      threadEl?.getAttribute("data-legacy-thread-id") ||
      null;

    const messageEl =
      main.querySelector("[data-message-id]") ||
      main.querySelector("[data-legacy-message-id]");
    const externalMessageId =
      messageEl?.getAttribute("data-message-id") ||
      messageEl?.getAttribute("data-legacy-message-id") ||
      null;

    const timeEl =
      main.querySelector("span.g3") ||
      main.querySelector("span[title].g3") ||
      main.querySelector(".gH span[title]");
    const sentAt =
      timeEl?.getAttribute("title") ||
      timeEl?.getAttribute("alt") ||
      null;

    return {
      fullName: fullName || null,
      email: email || null,
      companyName,
      linkedinUrl: linkedinMatch ? linkedinMatch[0] : null,
      subject,
      snippet: (bodyText || "").slice(0, 600),
      bodyText: (bodyText || "").slice(0, 4000),
      toEmails,
      ccEmails: ccEmails.slice(0, 12),
      externalThreadId,
      externalMessageId,
      sentAt,
    };
  }

  function fingerprint(person) {
    return [
      person.email || "",
      person.fullName || "",
      person.subject || "",
      person.externalThreadId || "",
      person.externalMessageId || "",
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
        emailContext: {
          subject: person.subject,
          fromEmail: person.email,
          fromName: person.fullName,
          toEmails: person.toEmails,
          ccEmails: person.ccEmails,
          sourceUrl: location.href,
          snippet: person.snippet,
          bodyText: person.bodyText,
          externalThreadId: person.externalThreadId,
          externalMessageId: person.externalMessageId,
          sentAt: person.sentAt,
          direction: "inbound",
        },
      });

      lastFingerprint = fp;

      if (res.closeMatch && res.best) {
        const b = res.best;
        const logged = res.activityLogged
          ? "\nConversation logged"
          : "";
        SecureCRMPanel.showPanel(
          `Match (${b.score})\n${b.entity_type.toUpperCase()}: ${b.full_name}\n${b.job_title || ""}\n${b.company_name || b.email || ""}${logged}`,
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
                  email: person.email || "",
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
                if (person.email && !filled.email) filled.email = person.email;
                const out = await SecureCRM.captureLeads({
                  source: "gmail",
                  sourceUrl: location.href,
                  leads: [filled],
                });
                const leadId = out.results?.[0]?.leadId;
                if (leadId) {
                  try {
                    await SecureCRM.matchPerson({
                      fullName: filled.fullName,
                      email: filled.email || person.email,
                      linkedinUrl: filled.linkedinUrl || null,
                      emailContext: {
                        subject: person.subject,
                        fromEmail: person.email,
                        fromName: person.fullName,
                        toEmails: person.toEmails,
                        ccEmails: person.ccEmails,
                        sourceUrl: location.href,
                        snippet: person.snippet,
                        bodyText: person.bodyText,
                        externalThreadId: person.externalThreadId,
                        externalMessageId: person.externalMessageId,
                        sentAt: person.sentAt,
                        direction: "inbound",
                      },
                    });
                  } catch {
                    /* conversation log is best-effort */
                  }
                }
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
    await SecureCRMFAB.mount(
      [
        {
          id: "match",
          label: "Match to CRM",
          primary: true,
          onClick: () => runMatch(),
        },
      ],
      { title: "Gmail → KINETIC" },
    );
    scheduleScan();
  }

  const obs = new MutationObserver(() => scheduleScan());
  obs.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void mount());
  } else {
    void mount();
  }
})();
