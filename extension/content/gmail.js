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

    const fromEmail =
      fromNode?.getAttribute("email") ||
      fromNode?.getAttribute("data-hovercard-id") ||
      "";
    const fromName =
      fromNode?.getAttribute("name") ||
      SecureCRM.text(fromNode) ||
      "";

    const toNodes = main.querySelectorAll(
      ".g2 span[email], .hb span[email], span.g2[email], [email].g2",
    );
    const toEmails = collectEmails(toNodes).filter(
      (e) => e !== String(fromEmail).toLowerCase(),
    );

    const bodyEl =
      main.querySelector(".a3s.aiL") ||
      main.querySelector(".a3s") ||
      main.querySelector("[data-message-id]");
    const bodyText = SecureCRM.text(bodyEl) || "";

    const sig = SecureCRMSignature.parseEmailSignature(bodyText, {
      fromEmail,
      fromName,
    });

    let companyName = sig.companyName;
    if (!companyName && fromEmail.includes("@")) {
      const domain = fromEmail.split("@")[1] || "";
      if (
        domain &&
        !/(gmail|yahoo|hotmail|outlook|icloud|googlemail)\./i.test(domain)
      ) {
        companyName = domain.split(".")[0];
      }
    }

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
      site: "gmail",
      subject,
      fullName: sig.fullName || fromName || null,
      email: sig.email || fromEmail || null,
      phone: sig.phone || null,
      jobTitle: sig.jobTitle || null,
      companyName: companyName || null,
      website: sig.website || null,
      linkedinUrl: sig.linkedinUrl || null,
      snippet: (bodyText || "").slice(0, 600),
      bodyText: (bodyText || "").slice(0, 4000),
      toEmails,
      externalThreadId,
      externalMessageId,
      sentAt,
      sourceUrl: location.href,
    };
  }

  function fingerprint(person) {
    return [
      person.email || "",
      person.fullName || "",
      person.subject || "",
      person.phone || "",
      person.externalThreadId || "",
      person.externalMessageId || "",
      person.linkedinUrl || "",
    ].join("|");
  }

  function publishContext(force = false) {
    const person = parseOpenEmail();
    if (!person.fullName && !person.email && !person.linkedinUrl) {
      if (force) {
        chrome.runtime.sendMessage({
          type: "PAGE_CONTEXT",
          site: "gmail",
          empty: true,
          person: null,
          fingerprint: "",
        });
      }
      return;
    }
    const fp = fingerprint(person);
    if (!force && fp === lastFingerprint) return;
    lastFingerprint = fp;
    chrome.runtime.sendMessage({
      type: "PAGE_CONTEXT",
      site: "gmail",
      empty: false,
      fingerprint: fp,
      person,
    });
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(async () => {
      const cfg = await SecureCRM.getConfig();
      if (!cfg.autoScanGmail) return;
      publishContext(false);
    }, 400);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "SCRM_PARSE_GMAIL" || msg?.type === "SCRM_GET_PAGE_PERSON") {
      const person = parseOpenEmail();
      sendResponse({
        ok: Boolean(person.fullName || person.email || person.linkedinUrl),
        person,
        fingerprint: fingerprint(person),
      });
      return false;
    }
    return false;
  });

  // Remove any leftover injected UI from older builds
  document.getElementById("securecrm-panel")?.remove();
  document.getElementById("scrm-fab-root")?.remove();
  document.getElementById("securecrm-form")?.remove();

  const obs = new MutationObserver(() => scheduleScan());
  obs.observe(document.documentElement, { childList: true, subtree: true });
  scheduleScan();
  publishContext(true);
})();
