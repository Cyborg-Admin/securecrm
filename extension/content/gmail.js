(() => {
  function parseOpenEmail() {
    const main =
      document.querySelector('[role="main"]') ||
      document.querySelector(".AO") ||
      document.body;

    const subject =
      SecureCRM.text(main.querySelector("h2.hP")) ||
      SecureCRM.text(main.querySelector("[data-thread-perm-id] h2")) ||
      "";

    const fromNode =
      main.querySelector("span.gD[email]") ||
      main.querySelector("span[email].gD") ||
      main.querySelector(".gD");

    const email =
      fromNode?.getAttribute("email") ||
      fromNode?.getAttribute("data-hovercard-id") ||
      "";
    const fullName =
      fromNode?.getAttribute("name") ||
      SecureCRM.text(fromNode) ||
      "";

    // Best-effort company guess from email domain
    let companyName = null;
    if (email && email.includes("@")) {
      const domain = email.split("@")[1] || "";
      if (domain && !/(gmail|yahoo|hotmail|outlook|icloud)\./i.test(domain)) {
        companyName = domain.split(".")[0];
      }
    }

    const bodyText = SecureCRM.text(main.querySelector(".a3s")) || "";
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

  async function runMatch() {
    const person = parseOpenEmail();
    if (!person.fullName && !person.email && !person.linkedinUrl) {
      SecureCRMPanel.setStatus("Open an email first — no sender detected.");
      return;
    }

    SecureCRMPanel.setStatus(
      `Matching ${person.fullName || person.email || "contact"}…`,
    );

    try {
      const res = await SecureCRM.matchPerson({
        fullName: person.fullName,
        email: person.email,
        companyName: person.companyName,
        linkedinUrl: person.linkedinUrl,
      });

      if (res.closeMatch && res.best) {
        const b = res.best;
        SecureCRMPanel.showPanel(
          `Best match (${b.score})\n${b.entity_type.toUpperCase()}: ${b.full_name}\n${b.job_title || ""}\n${b.company_name || b.email || ""}`,
          [
            {
              label: "Dismiss",
              onClick: () => SecureCRMPanel.setStatus("Match dismissed."),
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
                if (!person.linkedinUrl) {
                  SecureCRMPanel.setStatus(
                    "LinkedIn URL is required as UID. Add a LinkedIn link in the email or enter one when creating leads in the CRM.",
                  );
                  return;
                }
                const out = await SecureCRM.captureLeads({
                  source: "gmail",
                  sourceUrl: location.href,
                  leads: [
                    {
                      linkedinUrl: person.linkedinUrl,
                      fullName: person.fullName || person.email || "Gmail lead",
                      jobTitle: null,
                      companyName: person.companyName,
                      industry: null,
                      website: person.email?.includes("@")
                        ? `https://${person.email.split("@")[1]}`
                        : null,
                      location: null,
                      headline: person.subject || null,
                      metadata: { gmail_email: person.email, subject: person.subject },
                    },
                  ],
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
            label: "Refresh match",
            onClick: () => runMatch(),
          },
        ],
      );
    } catch (e) {
      SecureCRMPanel.setStatus(e.message);
    }
  }

  function mount() {
    if (document.getElementById("scrm-float-gmail")) return;
    const bar = document.createElement("div");
    bar.id = "scrm-float-gmail";
    bar.className = "scrm-float-bar";
    bar.innerHTML = `<button class="primary" id="scrm-gmail-match">Match to CRM</button>`;
    document.documentElement.appendChild(bar);
    bar.querySelector("#scrm-gmail-match").onclick = () => runMatch();
  }

  mount();
  new MutationObserver(() => {
    mount();
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
