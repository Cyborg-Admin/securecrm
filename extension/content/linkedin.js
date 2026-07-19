(() => {
  const SOURCE = "linkedin";
  let bulkRunning = false;
  let batchId = null;
  let lastUrl = location.href;
  let barMode = "";

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function isProfilePage(url = location.href) {
    return /linkedin\.com\/in\//i.test(url);
  }

  function isSearchPage(url = location.href) {
    return /linkedin\.com\/search\/results\/people/i.test(url);
  }

  function decodeHtml(str) {
    const el = document.createElement("textarea");
    el.innerHTML = str;
    return el.value;
  }

  /** Pull profile-ish JSON from LinkedIn code/script blobs. */
  function scrapeFromEmbeddedCode(preferredSlug) {
    const blobs = [];
    for (const node of document.querySelectorAll("code, script")) {
      const raw = node.textContent || "";
      if (
        raw.includes("publicIdentifier") ||
        raw.includes("firstName") ||
        raw.includes("miniProfile") ||
        raw.includes("headline")
      ) {
        blobs.push(raw.length > 500000 ? raw.slice(0, 500000) : raw);
      }
    }

    // Also scan full HTML lightly for escaped JSON fragments
    const html = document.documentElement.innerHTML;
    if (html.includes("publicIdentifier")) {
      blobs.push(html.slice(0, 800000));
    }

    let best = null;
    for (const blob of blobs) {
      const decoded = decodeHtml(blob);
      const identifiers = [
        ...decoded.matchAll(/"publicIdentifier"\s*:\s*"([^"]+)"/g),
      ].map((m) => m[1]);

      for (const id of identifiers) {
        if (preferredSlug && id.toLowerCase() !== preferredSlug.toLowerCase()) {
          continue;
        }
        const around = decoded.indexOf(`"publicIdentifier":"${id}"`);
        const windowText =
          around >= 0
            ? decoded.slice(Math.max(0, around - 2500), around + 4000)
            : decoded;

        const first =
          windowText.match(/"firstName"\s*:\s*"([^"]+)"/)?.[1] || "";
        const last =
          windowText.match(/"lastName"\s*:\s*"([^"]+)"/)?.[1] || "";
        const headline =
          windowText.match(/"headline"\s*:\s*"([^"]+)"/)?.[1] ||
          windowText.match(/"occupation"\s*:\s*"([^"]+)"/)?.[1] ||
          "";
        const geo =
          windowText.match(/"defaultLocalizedName"\s*:\s*"([^"]+)"/)?.[1] ||
          windowText.match(/"geographicArea"\s*:\s*"([^"]+)"/)?.[1] ||
          "";

        let companyName = null;
        let jobTitle = headline || null;
        if (headline.includes(" at ")) {
          const [title, company] = headline.split(" at ");
          jobTitle = title.trim();
          companyName = company.trim();
        }

        const fullName = `${first} ${last}`.trim();
        if (!fullName && !preferredSlug) continue;

        const candidate = {
          linkedinUrl: SecureCRM.normalizeLinkedIn(
            `https://www.linkedin.com/in/${id}`,
          ),
          fullName: fullName || id,
          jobTitle,
          companyName,
          industry: null,
          website: null,
          location: geo || null,
          headline: headline || null,
          metadata: { page: "embedded_code", publicIdentifier: id },
        };

        if (preferredSlug && id.toLowerCase() === preferredSlug.toLowerCase()) {
          return candidate;
        }
        if (!best) best = candidate;
      }
    }
    return best;
  }

  function profileSlugFromUrl(url = location.href) {
    const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function scrapeProfileDom() {
    const slug = profileSlugFromUrl();
    const h1 =
      SecureCRM.text(document.querySelector("main h1")) ||
      SecureCRM.text(document.querySelector("h1")) ||
      SecureCRM.text(document.querySelector(".text-heading-xlarge"));

    const titleMeta =
      document.querySelector('meta[property="og:title"]')?.content ||
      document.title.replace(/\s*\|\s*LinkedIn.*$/i, "").trim();

    const fullName = h1 || titleMeta;
    const headline =
      SecureCRM.text(
        document.querySelector("main .text-body-medium.break-words"),
      ) ||
      SecureCRM.text(document.querySelector(".text-body-medium.break-words")) ||
      document.querySelector('meta[property="og:description"]')?.content ||
      "";

    const location =
      SecureCRM.text(
        document.querySelector(
          "span.text-body-small.inline.t-black--light.break-words",
        ),
      ) ||
      SecureCRM.text(
        document.querySelector(
          '.pv-text-details__left-panel .text-body-small:not(.inline)',
        ),
      ) ||
      "";

    let companyName = null;
    let jobTitle = headline;
    const companyLink = document.querySelector(
      'a[href*="/company/"] span[aria-hidden="true"], a[data-field="experience_company_logo"] span',
    );
    if (companyLink) companyName = SecureCRM.text(companyLink);
    if (headline.includes(" at ")) {
      const [title, company] = headline.split(" at ");
      jobTitle = title.trim();
      companyName = companyName || company.trim();
    }

    if (!fullName || !slug) return null;
    return {
      linkedinUrl: SecureCRM.normalizeLinkedIn(location.href),
      fullName,
      jobTitle: jobTitle || null,
      companyName,
      industry: null,
      website: null,
      location: location || null,
      headline: headline || null,
      metadata: { page: "profile_dom" },
    };
  }

  function scrapeProfile() {
    const slug = profileSlugFromUrl();
    const fromCode = scrapeFromEmbeddedCode(slug);
    const fromDom = scrapeProfileDom();
    if (!fromCode && !fromDom) return null;
    return {
      linkedinUrl:
        fromDom?.linkedinUrl ||
        fromCode?.linkedinUrl ||
        SecureCRM.normalizeLinkedIn(location.href),
      fullName: fromDom?.fullName || fromCode?.fullName,
      jobTitle: fromDom?.jobTitle || fromCode?.jobTitle || null,
      companyName: fromDom?.companyName || fromCode?.companyName || null,
      industry: fromDom?.industry || fromCode?.industry || null,
      website: fromDom?.website || fromCode?.website || null,
      location: fromDom?.location || fromCode?.location || null,
      headline: fromDom?.headline || fromCode?.headline || null,
      metadata: {
        page: "profile",
        sources: [fromDom && "dom", fromCode && "code"].filter(Boolean),
      },
    };
  }

  /** Bulk harvest: every /in/ link + nearby text, not fragile card classes. */
  function scrapeSearchResults() {
    const leads = [];
    const seen = new Set();
    const anchors = [
      ...document.querySelectorAll('a[href*="/in/"]'),
      ...document.querySelectorAll('a[href*="linkedin.com/in/"]'),
    ];

    for (const link of anchors) {
      const href = link.href || link.getAttribute("href") || "";
      if (!/\/in\//i.test(href)) continue;
      if (/\/in\/ACo|\/in\/AEMA|\/pub\/dir\//i.test(href)) continue;

      const linkedinUrl = SecureCRM.normalizeLinkedIn(href);
      if (!linkedinUrl || seen.has(linkedinUrl)) continue;
      seen.add(linkedinUrl);

      const card =
        link.closest("li") ||
        link.closest('[data-chameleon-result-urn]') ||
        link.closest(".entity-result") ||
        link.closest("div[role='listitem']") ||
        link.parentElement?.parentElement?.parentElement ||
        link.parentElement;

      const ariaName = SecureCRM.text(
        link.querySelector('span[aria-hidden="true"]'),
      );
      const visibleName =
        ariaName ||
        SecureCRM.text(link).replace(/View .+ profile/i, "").trim();

      const cardText = SecureCRM.text(card).slice(0, 400);
      const lines = cardText
        .split(/(?<=[.!?])\s+|\n|·/)
        .map((s) => s.trim())
        .filter(Boolean);

      let fullName = visibleName;
      if (!fullName || fullName.length < 2 || /linkedin|connect|follow/i.test(fullName)) {
        fullName = lines.find((l) => l.length > 2 && l.length < 80 && !/^\d/.test(l)) || "";
      }
      if (!fullName) {
        const slug = profileSlugFromUrl(linkedinUrl);
        fullName = slug ? slug.replace(/-/g, " ") : "";
      }
      if (!fullName) continue;

      let jobTitle = null;
      let companyName = null;
      let location = null;
      const primary =
        lines.find(
          (l) =>
            l !== fullName &&
            (l.includes(" at ") ||
              /engineer|manager|director|founder|officer|head|vp|sales|designer|consultant/i.test(
                l,
              )),
        ) || "";
      if (primary.includes(" at ")) {
        const [title, company] = primary.split(" at ");
        jobTitle = title.trim();
        companyName = company.trim();
      } else if (primary) {
        jobTitle = primary;
      }

      const locLine = lines.find((l) => /,/.test(l) && l !== fullName && l !== primary);
      if (locLine) location = locLine;

      // Prefer embedded code for this slug when available
      const slug = profileSlugFromUrl(linkedinUrl);
      const coded = slug ? scrapeFromEmbeddedCode(slug) : null;

      leads.push({
        linkedinUrl,
        fullName: coded?.fullName || fullName,
        jobTitle: coded?.jobTitle || jobTitle,
        companyName: coded?.companyName || companyName,
        industry: null,
        website: null,
        location: coded?.location || location,
        headline: coded?.headline || primary || null,
        metadata: { page: "search_links", slug },
      });
    }

    // Fallback: regex over HTML for /in/ slugs if DOM anchors missed
    if (!leads.length) {
      const html = document.documentElement.innerHTML;
      const slugs = new Set(
        [...html.matchAll(/linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/gi)].map((m) =>
          decodeURIComponent(m[1]),
        ),
      );
      for (const slug of slugs) {
        if (/^ACo|AEMA/i.test(slug)) continue;
        const linkedinUrl = SecureCRM.normalizeLinkedIn(
          `https://www.linkedin.com/in/${slug}`,
        );
        if (seen.has(linkedinUrl)) continue;
        seen.add(linkedinUrl);
        const coded = scrapeFromEmbeddedCode(slug);
        leads.push({
          linkedinUrl,
          fullName: coded?.fullName || slug.replace(/-/g, " "),
          jobTitle: coded?.jobTitle || null,
          companyName: coded?.companyName || null,
          industry: null,
          website: null,
          location: coded?.location || null,
          headline: coded?.headline || null,
          metadata: { page: "search_html", slug },
        });
      }
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
    SecureCRMPanel.setStatus("Reading profile…");
    await sleep(400);
    let lead = scrapeProfile();
    if (!lead?.fullName) {
      lead = await SecureCRMForm.showLeadForm({
        linkedinUrl: SecureCRM.normalizeLinkedIn(location.href),
        fullName: "",
        jobTitle: null,
        companyName: null,
        industry: null,
        website: null,
        location: null,
        headline: null,
        metadata: { page: "profile_manual" },
      });
      if (!lead) return;
    } else {
      const filled = await SecureCRMForm.showLeadForm(lead);
      if (!filled) return;
      lead = filled;
    }

    SecureCRMPanel.setStatus(`Saving ${lead.fullName}…`);
    const res = await SecureCRM.captureLeads({
      source: SOURCE,
      sourceUrl: location.href,
      leads: [lead],
    });
    SecureCRMPanel.setStatus(
      `${lead.fullName}: ${res.created ? "created" : "updated"}`,
    );
  }

  async function capturePage() {
    SecureCRMPanel.setStatus("Scanning page for profiles…");
    await sleep(300);
    const leads = scrapeSearchResults();
    if (!leads.length) {
      SecureCRMPanel.setStatus(
        "No LinkedIn profile links found on this page. Scroll results into view, then try again.",
      );
      return;
    }
    SecureCRMPanel.setStatus(`Found ${leads.length} profiles. Saving…`);
    const res = await SecureCRMForm.captureManyWithForm(
      SOURCE,
      location.href,
      leads,
      { startBatch: true, finishBatch: true },
    );
    SecureCRMPanel.setStatus(
      `Page: ${res.created} new, ${res.updated} updated` +
        (res.skippedForm ? ` (${res.skippedForm} needed form)` : ""),
    );
  }

  async function runBulk(pages) {
    if (bulkRunning) return;
    const cfg = await SecureCRM.getConfig();
    pages = pages || cfg.bulkPageLimit || 10;
    bulkRunning = true;
    batchId = null;
    let page = 1;
    let totalCreated = 0;
    let totalUpdated = 0;
    try {
      while (page <= pages && bulkRunning) {
        SecureCRMPanel.setStatus(`Bulk ${page}/${pages}: scanning…`);
        await sleep(1400);
        const leads = scrapeSearchResults();
        if (!leads.length) {
          SecureCRMPanel.setStatus(`Page ${page}: no profiles found.`);
          break;
        }
        const res = await SecureCRMForm.captureManyWithForm(
          SOURCE,
          location.href,
          leads,
          { batchId, startBatch: page === 1, finishBatch: false },
        );
        batchId = res.batchId;
        totalCreated += res.created;
        totalUpdated += res.updated;
        SecureCRMPanel.setStatus(
          `Page ${page}: +${res.created}/${res.updated}\nTotal ${totalCreated} new, ${totalUpdated} updated`,
        );
        if (page >= pages) break;
        if (!clickNextPage()) break;
        page += 1;
        await sleep(2800);
      }
      if (batchId) {
        await SecureCRM.captureLeads({
          source: SOURCE,
          sourceUrl: location.href,
          batchId,
          finishBatch: true,
          leads: [],
        });
      }
    } catch (e) {
      SecureCRMPanel.setStatus(e.message || "Bulk failed");
    } finally {
      bulkRunning = false;
    }
  }

  function desiredMode() {
    if (isProfilePage()) return "profile";
    if (isSearchPage()) return "search";
    return "";
  }

  async function mountFab(force = false) {
    const mode = desiredMode();
    if (!mode) {
      SecureCRMFAB.remove();
      document.getElementById("scrm-float-linkedin")?.remove();
      barMode = "";
      return;
    }
    if (!force && document.getElementById("scrm-fab-root") && barMode === mode) {
      return;
    }
    barMode = mode;
    document.getElementById("scrm-float-linkedin")?.remove();

    if (mode === "profile") {
      await SecureCRMFAB.mount(
        [
          {
            id: "capture",
            label: "Capture profile",
            primary: true,
            onClick: () =>
              captureCurrentProfile().catch((e) =>
                SecureCRMPanel.setStatus(e.message),
              ),
          },
        ],
        { title: "SecureCRM · LinkedIn profile" },
      );
      SecureCRMPanel.setStatus("Profile ready — open FAB to capture.");
      return;
    }

    await SecureCRMFAB.mount(
      [
        {
          id: "page",
          label: "Capture page",
          onClick: () =>
            capturePage().catch((e) => SecureCRMPanel.setStatus(e.message)),
        },
        {
          id: "bulk",
          label: "Bulk + next pages",
          primary: true,
          onClick: () => runBulk(),
        },
        {
          id: "stop",
          label: "Stop bulk",
          onClick: () => {
            bulkRunning = false;
            SecureCRMPanel.setStatus("Bulk capture stopped.");
          },
        },
        {
          id: "badges",
          label: "Refresh CRM badges",
          onClick: () => SecureCRMBadges.refresh(),
        },
      ],
      { title: "SecureCRM · LinkedIn search" },
    );
  }

  function onUrlMaybeChanged() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    mountFab(true);
    SecureCRMBadges.refresh();
    if (isProfilePage()) {
      setTimeout(() => {
        const lead = scrapeProfile();
        SecureCRMPanel.setStatus(
          lead?.fullName
            ? `Opened ${lead.fullName} — ready to capture.`
            : "Profile opened — ready to capture.",
        );
      }, 700);
    }
  }

  const _push = history.pushState;
  const _replace = history.replaceState;
  history.pushState = function (...args) {
    const ret = _push.apply(this, args);
    queueMicrotask(onUrlMaybeChanged);
    return ret;
  };
  history.replaceState = function (...args) {
    const ret = _replace.apply(this, args);
    queueMicrotask(onUrlMaybeChanged);
    return ret;
  };
  window.addEventListener("popstate", onUrlMaybeChanged);

  mountFab(true);
  SecureCRMBadges.start();
  setInterval(onUrlMaybeChanged, 800);
  new MutationObserver(() => {
    if (!document.getElementById("scrm-fab-root") && desiredMode()) {
      mountFab(true);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
