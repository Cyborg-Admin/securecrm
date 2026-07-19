(() => {
  const SOURCE = "salesnav";
  let bulkRunning = false;
  let batchId = null;

  function isLeadProfile() {
    return /\/sales\/lead\//i.test(location.href) || /\/sales\/people\//i.test(location.href);
  }

  function isSearch() {
    return /\/sales\/search/i.test(location.href) || /\/sales\/lists/i.test(location.href);
  }

  function scrapeProfile() {
    const name =
      SecureCRM.text(document.querySelector('[data-anonymize="person-name"]')) ||
      SecureCRM.text(document.querySelector("h1")) ||
      SecureCRM.text(document.querySelector(".profile-topcard-person-entity__name"));
    const jobTitle =
      SecureCRM.text(document.querySelector('[data-anonymize="title"]')) ||
      SecureCRM.text(document.querySelector(".profile-topcard__summary-position-title"));
    const companyName =
      SecureCRM.text(document.querySelector('[data-anonymize="company-name"]')) ||
      SecureCRM.text(document.querySelector('a[data-anonymize="company-name"]'));
    const location =
      SecureCRM.text(document.querySelector('[data-anonymize="location"]')) ||
      SecureCRM.text(document.querySelector(".profile-topcard__location-data"));
    const industry =
      SecureCRM.text(document.querySelector('[data-anonymize="industry"]')) || null;

    let linkedinUrl = location.href;
    const classic = document.querySelector('a[href*="linkedin.com/in/"]');
    if (classic) linkedinUrl = classic.href;
    linkedinUrl = SecureCRM.normalizeLinkedIn(linkedinUrl);

    if (!name || !linkedinUrl) return null;
    return {
      linkedinUrl,
      fullName: name,
      jobTitle: jobTitle || null,
      companyName: companyName || null,
      industry,
      website: null,
      location: location || null,
      headline: jobTitle || null,
      metadata: { page: "salesnav_profile" },
    };
  }

  function scrapeSearchResults() {
    const rows = [
      ...document.querySelectorAll("tr.artdeco-models-table-row"),
      ...document.querySelectorAll("li.artdeco-list__item"),
      ...document.querySelectorAll("[data-scroll-into-view]"),
      ...document.querySelectorAll(".result-lockup"),
    ];
    const leads = [];
    const seen = new Set();

    for (const row of rows) {
      const link =
        row.querySelector('a[href*="/sales/lead/"]') ||
        row.querySelector('a[href*="/in/"]') ||
        row.querySelector('a[data-control-name="view_lead_panel_via_search_lead_name"]');
      if (!link) continue;
      const linkedinUrl = SecureCRM.normalizeLinkedIn(link.href);
      if (!linkedinUrl || seen.has(linkedinUrl)) continue;
      seen.add(linkedinUrl);

      const fullName =
        SecureCRM.text(row.querySelector('[data-anonymize="person-name"]')) ||
        SecureCRM.text(link);
      if (!fullName) continue;

      const jobTitle =
        SecureCRM.text(row.querySelector('[data-anonymize="title"]')) ||
        SecureCRM.text(row.querySelector(".result-lockup__highlight-keyword"));
      const companyName =
        SecureCRM.text(row.querySelector('[data-anonymize="company-name"]')) ||
        SecureCRM.text(row.querySelector('a[data-anonymize="company-name"]'));
      const location =
        SecureCRM.text(row.querySelector('[data-anonymize="location"]')) || null;

      leads.push({
        linkedinUrl,
        fullName,
        jobTitle: jobTitle || null,
        companyName: companyName || null,
        industry: null,
        website: null,
        location,
        headline: jobTitle || null,
        metadata: { page: "salesnav_search" },
      });
    }
    return leads;
  }

  function clickNext() {
    const next =
      document.querySelector('button[aria-label="Next"]') ||
      document.querySelector(".artdeco-pagination__button--next") ||
      document.querySelector('button[aria-label="Next page"]');
    if (!next || next.disabled) return false;
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
        SecureCRMPanel.setStatus(`Sales Nav bulk ${page}/${pages}…`);
        await sleep(1400);
        const leads = scrapeSearchResults();
        if (!leads.length) break;
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
        await sleep(2800);
      }
    } catch (e) {
      SecureCRMPanel.setStatus(e.message);
    } finally {
      bulkRunning = false;
    }
  }

  function mount() {
    if (document.getElementById("scrm-float-salesnav")) return;
    const bar = document.createElement("div");
    bar.id = "scrm-float-salesnav";
    bar.className = "scrm-float-bar";

    if (isLeadProfile()) {
      bar.innerHTML = `<button class="primary" id="scrm-sn-one">Capture lead</button>`;
      document.documentElement.appendChild(bar);
      bar.querySelector("#scrm-sn-one").onclick = async () => {
        try {
          const scraped = scrapeProfile();
          const lead = await SecureCRMForm.showLeadForm(
            scraped || {
              linkedinUrl: SecureCRM.normalizeLinkedIn(location.href),
              fullName: "",
              jobTitle: null,
              companyName: null,
              industry: null,
              website: null,
              location: null,
              headline: null,
              metadata: { page: "salesnav_manual" },
            },
          );
          if (!lead) return;
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
      };
      return;
    }

    if (isSearch()) {
      bar.innerHTML = `
        <button id="scrm-sn-page">Capture page</button>
        <button class="primary" id="scrm-sn-bulk">Bulk + next pages</button>
        <button id="scrm-sn-stop">Stop</button>
      `;
      document.documentElement.appendChild(bar);
      bar.querySelector("#scrm-sn-page").onclick = async () => {
        try {
          const leads = scrapeSearchResults();
          if (!leads.length) {
            SecureCRMPanel.setStatus("No Sales Nav rows found on this page.");
            return;
          }
          const res = await SecureCRMForm.captureManyWithForm(
            SOURCE,
            location.href,
            leads,
            { startBatch: true, finishBatch: true },
          );
          SecureCRMPanel.setStatus(`Saved page: ${res.created} new, ${res.updated} updated`);
        } catch (e) {
          SecureCRMPanel.setStatus(e.message);
        }
      };
      bar.querySelector("#scrm-sn-bulk").onclick = () => runBulk(10);
      bar.querySelector("#scrm-sn-stop").onclick = () => {
        bulkRunning = false;
        SecureCRMPanel.setStatus("Stopped.");
      };
    }
  }

  mount();
  new MutationObserver(mount).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
