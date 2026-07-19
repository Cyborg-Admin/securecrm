(() => {
  const SOURCE = "linkedin";
  let bulkRunning = false;
  let batchId = null;

  function isProfilePage() {
    return /linkedin\.com\/in\//i.test(location.href);
  }

  function isSearchPage() {
    return /linkedin\.com\/search\/results\/people/i.test(location.href);
  }

  function scrapeProfile() {
    const name =
      SecureCRM.text(document.querySelector("h1")) ||
      SecureCRM.text(document.querySelector(".text-heading-xlarge"));
    const headline =
      SecureCRM.text(document.querySelector(".text-body-medium.break-words")) ||
      SecureCRM.text(document.querySelector("div.text-body-medium"));
    const location =
      SecureCRM.text(document.querySelector("span.text-body-small.inline.t-black--light.break-words")) ||
      "";

    let companyName = "";
    let jobTitle = headline;
    const expCompany = document.querySelector(
      'a[href*="/company/"] span[aria-hidden="true"], a[data-field="experience_company_logo"]',
    );
    if (expCompany) companyName = SecureCRM.text(expCompany);

    const aboutIndustry = Array.from(document.querySelectorAll("span"))
      .map((s) => SecureCRM.text(s))
      .find((t) => /industry/i.test(t));

    const linkedinUrl = SecureCRM.normalizeLinkedIn(location.href);
    if (!name || !linkedinUrl) return null;

    return {
      linkedinUrl,
      fullName: name,
      jobTitle: jobTitle || null,
      companyName: companyName || null,
      industry: aboutIndustry || null,
      website: null,
      location: location || null,
      headline: headline || null,
      metadata: { page: "profile" },
    };
  }

  function scrapeSearchResults() {
    const cards = [
      ...document.querySelectorAll("li.reusable-search__result-container"),
      ...document.querySelectorAll("div.entity-result"),
      ...document.querySelectorAll('ul[role="list"] > li'),
    ];

    const leads = [];
    const seen = new Set();

    for (const card of cards) {
      const link =
        card.querySelector('a[href*="/in/"]') ||
        card.querySelector('a.app-aware-link[href*="/in/"]');
      if (!link) continue;
      const linkedinUrl = SecureCRM.normalizeLinkedIn(link.href);
      if (!linkedinUrl || seen.has(linkedinUrl)) continue;
      seen.add(linkedinUrl);

      const fullName =
        SecureCRM.text(card.querySelector("span[aria-hidden='true']")) ||
        SecureCRM.text(link) ||
        SecureCRM.text(card.querySelector(".entity-result__title-text"));
      if (!fullName || fullName.length < 2) continue;

      const primary =
        SecureCRM.text(card.querySelector(".entity-result__primary-subtitle")) ||
        SecureCRM.text(card.querySelector(".entity-result__summary"));
      const secondary =
        SecureCRM.text(card.querySelector(".entity-result__secondary-subtitle")) ||
        "";

      let jobTitle = primary;
      let companyName = "";
      if (primary.includes(" at ")) {
        const [title, company] = primary.split(" at ");
        jobTitle = title.trim();
        companyName = company.trim();
      } else if (secondary) {
        companyName = secondary;
      }

      leads.push({
        linkedinUrl,
        fullName,
        jobTitle: jobTitle || null,
        companyName: companyName || null,
        industry: null,
        website: null,
        location: secondary || null,
        headline: primary || null,
        metadata: { page: "search" },
      });
    }
    return leads;
  }

  function clickNextPage() {
    const next =
      document.querySelector('button[aria-label="Next"]') ||
      document.querySelector(".artdeco-pagination__button--next") ||
      document.querySelector('button.artdeco-pagination__button--next');
    if (!next || next.disabled || next.getAttribute("aria-disabled") === "true") {
      return false;
    }
    next.click();
    return true;
  }

  async function captureCurrentProfile() {
    const lead = scrapeProfile();
    if (!lead) {
      SecureCRMPanel.setStatus("Could not read this LinkedIn profile.");
      return;
    }
    SecureCRMPanel.setStatus(`Saving ${lead.fullName}…`);
    const res = await SecureCRM.captureLeads({
      source: SOURCE,
      sourceUrl: location.href,
      leads: [lead],
    });
    SecureCRMPanel.setStatus(
      `${lead.fullName}: ${res.created ? "created" : "updated"} (${res.captured} saved)`,
    );
  }

  async function runBulk(pages = 5) {
    if (bulkRunning) return;
    bulkRunning = true;
    batchId = null;
    let page = 1;
    let totalCreated = 0;
    let totalUpdated = 0;

    try {
      while (page <= pages && bulkRunning) {
        SecureCRMPanel.setStatus(`Bulk page ${page}/${pages}: scraping…`);
        await sleep(1200);
        const leads = scrapeSearchResults();
        if (!leads.length) {
          SecureCRMPanel.setStatus(`Page ${page}: no people cards found.`);
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
        totalCreated += res.created;
        totalUpdated += res.updated;
        SecureCRMPanel.setStatus(
          `Page ${page}: +${res.created} new / ${res.updated} updated\nTotal: ${totalCreated} new, ${totalUpdated} updated`,
        );

        if (page >= pages) break;
        const moved = clickNextPage();
        if (!moved) {
          SecureCRMPanel.setStatus(
            `Stopped: no next page.\nTotal: ${totalCreated} new, ${totalUpdated} updated`,
          );
          break;
        }
        page += 1;
        await sleep(2500);
      }
    } catch (e) {
      SecureCRMPanel.setStatus(e.message || "Bulk capture failed");
    } finally {
      bulkRunning = false;
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function mountBar() {
    if (document.getElementById("scrm-float-linkedin")) return;
    const bar = document.createElement("div");
    bar.id = "scrm-float-linkedin";
    bar.className = "scrm-float-bar";

    if (isProfilePage()) {
      bar.innerHTML = `<button class="primary" id="scrm-capture-one">Capture profile</button>`;
      document.documentElement.appendChild(bar);
      bar.querySelector("#scrm-capture-one").onclick = () => {
        captureCurrentProfile().catch((e) => SecureCRMPanel.setStatus(e.message));
      };
      return;
    }

    if (isSearchPage()) {
      bar.innerHTML = `
        <button id="scrm-capture-page">Capture page</button>
        <button class="primary" id="scrm-capture-bulk">Bulk + next pages</button>
        <button id="scrm-stop">Stop</button>
      `;
      document.documentElement.appendChild(bar);
      bar.querySelector("#scrm-capture-page").onclick = async () => {
        try {
          const leads = scrapeSearchResults();
          SecureCRMPanel.setStatus(`Saving ${leads.length} leads from this page…`);
          const res = await SecureCRM.captureLeads({
            source: SOURCE,
            sourceUrl: location.href,
            startBatch: true,
            finishBatch: true,
            leads,
          });
          SecureCRMPanel.setStatus(
            `Page saved: ${res.created} new, ${res.updated} updated`,
          );
        } catch (e) {
          SecureCRMPanel.setStatus(e.message);
        }
      };
      bar.querySelector("#scrm-capture-bulk").onclick = () => runBulk(10);
      bar.querySelector("#scrm-stop").onclick = () => {
        bulkRunning = false;
        SecureCRMPanel.setStatus("Bulk capture stopped.");
      };
    }
  }

  mountBar();
  const obs = new MutationObserver(() => mountBar());
  obs.observe(document.documentElement, { childList: true, subtree: true });
})();
