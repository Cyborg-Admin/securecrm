(() => {
  const FREE_MAIL =
    /(gmail|yahoo|hotmail|outlook|icloud|googlemail|live|msn)\./i;
  const PHONE_RE =
    /(?:(?:tel|phone|m|mobile|direct)[:\s]*)?(\+?\d[\d\s().-]{6,}\d)/gi;
  const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const URL_RE = /https?:\/\/[^\s<>"']+/gi;
  const LINKEDIN_RE =
    /https?:\/\/([\w.-]*\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+/i;

  function cleanLine(line) {
    return String(line || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function signatureBlock(bodyText) {
    const raw = String(bodyText || "").replace(/\r/g, "");
    if (!raw.trim()) return [];

    const byDash = raw.split(/\n--\s*\n|\n—{2,}\n|\n_{3,}\n/);
    let chunk = byDash.length > 1 ? byDash[byDash.length - 1] : raw;

    const thanksIdx = chunk.search(
      /\n(?:thanks|thank you|regards|best|cheers|kind regards|sincerely)\b[^\n]*\n/i,
    );
    if (thanksIdx >= 0) {
      chunk = chunk.slice(thanksIdx);
    }

    const lines = chunk
      .split("\n")
      .map(cleanLine)
      .filter((l) => l && l.length < 180);

    return lines.slice(-30);
  }

  function titleCaseCompany(domainPart) {
    if (!domainPart) return null;
    return domainPart
      .split(/[-_]/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ");
  }

  /**
   * Extract person/company details from an email body signature.
   * @returns {{
   *   fullName: string|null,
   *   email: string|null,
   *   phone: string|null,
   *   jobTitle: string|null,
   *   companyName: string|null,
   *   website: string|null,
   *   linkedinUrl: string|null,
   * }}
   */
  function parseEmailSignature(bodyText, hints = {}) {
    const lines = signatureBlock(bodyText);
    const blob = lines.join("\n");
    const fromEmail = (hints.fromEmail || "").toLowerCase();

    const emails = [...blob.matchAll(EMAIL_RE)].map((m) => m[0].toLowerCase());
    const email =
      emails.find((e) => e !== fromEmail) ||
      emails[0] ||
      (fromEmail.includes("@") ? fromEmail : null);

    let phone = null;
    for (const m of blob.matchAll(PHONE_RE)) {
      const digits = m[1].replace(/\D/g, "");
      if (digits.length >= 7 && digits.length <= 15) {
        phone = m[1].replace(/\s+/g, " ").trim();
        break;
      }
    }

    const linkedinMatch = blob.match(LINKEDIN_RE);
    const linkedinUrl = linkedinMatch ? linkedinMatch[0] : null;

    const urls = [...blob.matchAll(URL_RE)]
      .map((m) => m[0].replace(/[),.;]+$/, ""))
      .filter(
        (u) =>
          !/linkedin\.com|google\.com|mail\.google|schemas\.microsoft|aka\.ms/i.test(
            u,
          ),
      );
    const website = urls[0] || null;

    let companyName = hints.companyName || null;
    if (!companyName && email && email.includes("@")) {
      const domain = email.split("@")[1] || "";
      if (domain && !FREE_MAIL.test(domain)) {
        companyName = titleCaseCompany(domain.split(".")[0]);
      }
    }
    if (!companyName && website) {
      try {
        const host = new URL(website).hostname.replace(/^www\./, "");
        if (host && !FREE_MAIL.test(host)) {
          companyName = titleCaseCompany(host.split(".")[0]);
        }
      } catch {
        /* ignore */
      }
    }

    // Name: prefer From name; else first signature line that looks like a person
    let fullName = hints.fromName || null;
    if (!fullName) {
      for (const line of lines.slice(0, 6)) {
        if (EMAIL_RE.test(line) || URL_RE.test(line) || PHONE_RE.test(line)) {
          continue;
        }
        if (/^(tel|phone|mobile|www|http)/i.test(line)) continue;
        const words = line.split(/\s+/);
        if (words.length >= 2 && words.length <= 4 && line.length < 50) {
          fullName = line;
          break;
        }
      }
    }

    // Title: line after name, before company-looking line
    let jobTitle = null;
    const nameIdx = fullName
      ? lines.findIndex((l) => l.toLowerCase() === fullName.toLowerCase())
      : -1;
    const afterName = nameIdx >= 0 ? lines.slice(nameIdx + 1, nameIdx + 5) : lines.slice(0, 5);
    for (const line of afterName) {
      if (EMAIL_RE.test(line) || URL_RE.test(line) || PHONE_RE.test(line)) continue;
      if (companyName && line.toLowerCase().includes(companyName.toLowerCase())) {
        continue;
      }
      if (
        /^(inc|ltd|llc|plc|gmbh|corp|company)\b/i.test(line) ||
        /\b(inc|ltd|llc|plc|gmbh)\.?$/i.test(line)
      ) {
        if (!companyName) companyName = line;
        continue;
      }
      if (line.length > 3 && line.length < 80 && !/@/.test(line)) {
        jobTitle = line;
        break;
      }
    }

    return {
      fullName: fullName || null,
      email: email || null,
      phone: phone || null,
      jobTitle: jobTitle || null,
      companyName: companyName || null,
      website: website || null,
      linkedinUrl: linkedinUrl || null,
    };
  }

  window.SecureCRMSignature = { parseEmailSignature, signatureBlock };
})();
