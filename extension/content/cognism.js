(() => {
  const SOURCE = "cognism";
  let bulkRunning = false;
  let batchId = null;

  function scrapeCards() {
    const cards = [
      ...document.querySelectorAll("[data-testid*='contact'], [data-testid*='person']"),
      ...document.querySelectorAll("tr"),
      ...document.querySelectorAll("article, .contact-card, .search-result, .person-card"),
    ];

    const leads = [];
    const seen = new Set();

    for (const card of cards) {
      const linkedinAnchor =
        card.querySelector('a[href*="linkedin.com/in/"]') ||
        card.querySelector('a[href*="linkedin.com/sales/"]');
      if (!linkedinAnchor) continue;
      const linkedinUrl = SecureCRM.normalizeLinkedIn(linkedinAnchor.href);
      if (!linkedinUrl || seen.has(linkedinUrl)) continue;
      seen.add(linkedinUrl);

      const fullName =
        SecureCRM.text(card.querySelector("h2, h3, h4, [data-testid*='name']")) ||
        SecureCRM.text(linkedinAnchor);
      if (!fullName || fullName.length < 2) continue;

      const texts = [...card.querySelectorAll("span, p, div")]
        .map((el) => SecureCRM.text(el))
        .filter((t) => t && t.length < 120);

      const jobTitle =
        texts.find((t) => /manager|director|engineer|officer|head|vp|chief|founder|sales/i.test(t)) ||
        null;
      const companyName =
        SecureCRM.text(card.querySelector('a[href*="company"], [data-testid*="company"]')) ||
        texts.find((t) => t !== fullName && t !== jobTitle && !/linkedin/i.test(t)) ||
        null;
      const industry =
        texts.find((t) => /software|finance|health|manufactur|retail|saas/i.test(t)) || null;
      const websiteAnchor = card.querySelector('a[href^="http"]:not([href*="linkedin.com"]):not([href*="cognism.com"])');

      leads.push({
        linkedinUrl,
        fullName,
        jobTitle,
        companyName,
        industry,
        website: websiteAnchor?.href || null,
        location: texts.find((t) => /,/.test(t)) || null,
        headline: jobTitle,
        metadata: { page: "cognism_search" },
      });
    }
    return leads;
  }

  function scrapeProfile() {
    const leads = scrapeCards();
    if (leads[0]) {
      return { ...leads[0], metadata: { page: "cognism_profile" } };
    }
    const linkedinAnchor = document.querySelector('a[href*="linkedin.com/in/"]');
    if (!linkedinAnchor) return null;
    const fullName =
      SecureCRM.text(document.querySelector("h1, h2")) ||
      SecureCRM.text(linkedinAnchor);
    return {
      linkedinUrl: SecureCRM.normalizeLinkedIn(linkedinAnchor.href),
      fullName,
      jobTitle: null,
      companyName: null,
      industry: null,
      website: null,
      location: null,
      headline: null,
      metadata: { page: "cognism_profile" },
    };
  }

  function clickNext() {
    const next =
      document.querySelector('button[aria-label*="Next" i]') ||
      document.querySelector('a[aria-label*="Next" i]') ||
      [...document.querySelectorAll("button, a")].find((el) =>
        /^next$/i.test(SecureCRM.text(el)),
      );
    if (!next) return false;
    next.click();
    return true;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function runBulk(pages = 10) {
    if (bulkRunning) return;
    bulkRunning = true;
    batchId = null;
    let page = 1;
    let created = 0;
    let updated = 0;
    try {
      while (page <= pages && bulkRunning) {
        SecureCRMPanel.setStatus(`Cognism bulk ${page}/${pages}…`);
        await sleep(1200);
        const leads = scrapeCards();
        if (!leads.length) {
          SecureCRMPanel.setStatus("No Cognism rows with LinkedIn URLs found on this page.");
          break;
        }
        const res = await SecureCRM.captureLeads({
          source: SOURCE,
          sourceUrl: location.href,
          batchId,
          startBatch: page === 1,
          finishBatch: page === pages,
          leads,
        });
        batchId = res.batchId;
        created += res.created;
        updated += res.updated;
        SecureCRMPanel.setStatus(
          `Page ${page}: ${res.created} new / ${res.updated} updated\nTotal ${created}/${updated}`,
        );
        if (page >= pages || !clickNext()) break;
        page += 1;
        await sleep(2600);
      }
    } catch (e) {
      SecureCRMPanel.setStatus(e.message);
    } finally {
      bulkRunning = false;
    }
  }

  async function mount() {
    document.getElementById("scrm-float-cognism")?.remove();
    const cfg = await SecureCRM.getConfig();
    await SecureCRMFAB.mount(
      [
        {
          id: "one",
          label: "Capture profile",
          onClick: async () => {
            try {
              const lead = scrapeProfile();
              if (!lead?.fullName) {
                return SecureCRMPanel.setStatus("No Cognism profile detected.");
              }
              const res = await SecureCRM.captureLeads({
                source: SOURCE,
                sourceUrl: location.href,
                leads: [lead],
              });
              SecureCRMPanel.setStatus(
                `${lead.fullName}: ${res.created ? "created" : "updated"}`,
              );
            } catch (e) {
              SecureCRMPanel.setStatus(e.message);
            }
          },
        },
        {
          id: "page",
          label: "Capture page",
          onClick: async () => {
            try {
              const leads = scrapeCards();
              const res = await SecureCRM.captureLeads({
                source: SOURCE,
                sourceUrl: location.href,
                startBatch: true,
                finishBatch: true,
                leads,
              });
              SecureCRMPanel.setStatus(
                `Page: ${res.created} new, ${res.updated} updated`,
              );
            } catch (e) {
              SecureCRMPanel.setStatus(e.message);
            }
          },
        },
        {
          id: "bulk",
          label: "Bulk + next pages",
          primary: true,
          onClick: () => runBulk(cfg.bulkPageLimit || 10),
        },
        {
          id: "stop",
          label: "Stop",
          onClick: () => {
            bulkRunning = false;
            SecureCRMPanel.setStatus("Stopped.");
          },
        },
      ],
      { title: "SecureCRM · Cognism" },
    );
  }

  mount();
  new MutationObserver(() => {
    if (!document.getElementById("scrm-fab-root")) mount();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
