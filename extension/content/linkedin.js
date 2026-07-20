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

  function absMediaUrl(src) {
    if (!src || typeof src !== "string") return null;
    const cleaned = src.trim().replace(/&amp;/g, "&");
    if (!cleaned || cleaned.startsWith("data:")) return null;
    try {
      return new URL(cleaned, location.origin).href;
    } catch {
      return null;
    }
  }

  function scrapeHeadshotUrl() {
    const selectors = [
      "img.pv-top-card-profile-picture__image",
      "img.pv-top-card-profile-picture__image--show",
      ".pv-top-card__non-self-photo-wrapper img",
      ".pv-top-card--photo img",
      'button img[class*="profile-picture"]',
      'main img.evi-image[src*="profile"]',
      'main img.evi-image[src*="shrink_"]',
      ".presence-entity__image",
    ];
    for (const sel of selectors) {
      const img = document.querySelector(sel);
      const url = absMediaUrl(img?.src || img?.getAttribute("src"));
      if (url && !/ghost|data:image\/gif|static\.licdn\.com\/aero-v1\/sc\/h\//i.test(url)) {
        return url;
      }
    }
    const og = document.querySelector('meta[property="og:image"]')?.content;
    return absMediaUrl(og);
  }

  function scrapeCompanyLogoUrl(scope = document) {
    const selectors = [
      'a[data-field="experience_company_logo"] img',
      "#experience ~ div img[src*='company']",
      "#experience + div img",
      'section[id*="experience" i] img.evi-image',
      'a[href*="/company/"] img',
      ".pvs-entity__image-container img",
    ];
    for (const sel of selectors) {
      const img = scope.querySelector?.(sel) || document.querySelector(sel);
      const url = absMediaUrl(img?.src || img?.getAttribute("src"));
      if (url) return url;
    }
    return null;
  }

  function scrapeBio() {
    const aboutRoot =
      document.querySelector("#about")?.closest("section") ||
      document.querySelector('section[id*="about" i]') ||
      document.querySelector("#about ~ div") ||
      document.querySelector('[data-section="summary"]');

    if (aboutRoot && !SecureCRM.isOurUi?.(aboutRoot)) {
      const spans = [
        ...aboutRoot.querySelectorAll(
          'span[aria-hidden="true"], .inline-show-more-text, .pv-about__summary-text, .full-width',
        ),
      ];
      let best = "";
      for (const el of spans) {
        if (SecureCRM.isOurUi?.(el)) continue;
        const t = SecureCRM.text(el);
        if (
          t &&
          t.length > best.length &&
          !/^about$/i.test(t) &&
          !SecureCRM.isNoiseText?.(t)
        ) {
          best = t;
        }
      }
      if (best.length > 40) return best.slice(0, 4000);
    }

    // Embedded JSON summary / about
    const html = document.documentElement.innerHTML.slice(0, 900000);
    const summary =
      html.match(/"summary"\s*:\s*"((?:\\.|[^"\\]){40,})"/)?.[1] ||
      html.match(/"about"\s*:\s*"((?:\\.|[^"\\]){40,})"/)?.[1];
    if (summary) {
      try {
        return JSON.parse(`"${summary}"`).slice(0, 4000);
      } catch {
        return decodeHtml(summary).replace(/\\n/g, "\n").slice(0, 4000);
      }
    }
    return null;
  }

  function scrapeProfileMedia() {
    const photoUrl = scrapeHeadshotUrl();
    const companyLogoUrl = scrapeCompanyLogoUrl();
    const bio = scrapeBio();
    return {
      photoUrl: photoUrl || null,
      companyLogoUrl: companyLogoUrl || null,
      bio: bio || null,
    };
  }

  const MONTH_MAP = {
    jan: "01",
    january: "01",
    feb: "02",
    february: "02",
    mar: "03",
    march: "03",
    apr: "04",
    april: "04",
    may: "05",
    jun: "06",
    june: "06",
    jul: "07",
    july: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    september: "09",
    oct: "10",
    october: "10",
    nov: "11",
    november: "11",
    dec: "12",
    december: "12",
  };

  /** Normalize "Jan 2020" / "2020" → "YYYY-MM" for sorting. */
  function toSortMonth(part) {
    if (!part || /present/i.test(part)) return null;
    const t = String(part).replace(/\s+/g, " ").trim();
    const withMonth = t.match(
      /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})$/i,
    );
    if (withMonth) {
      const mm = MONTH_MAP[withMonth[1].toLowerCase()];
      return mm ? `${withMonth[2]}-${mm}` : `${withMonth[2]}-01`;
    }
    const yearOnly = t.match(/^(\d{4})$/);
    if (yearOnly) return `${yearOnly[1]}-01`;
    return null;
  }

  /**
   * Parse LinkedIn experience date lines into display + sort keys.
   * Handles: "Jan 2020 – Present", "2021 – 2023", "Mar 2019 – Dec 2020 · 1 yr 10 mos"
   */
  function parseExperienceDates(dateLine, fallbackText = "") {
    const raw = String(dateLine || fallbackText || "");
    const primary = raw.split("·")[0].trim() || raw.trim();
    const isCurrent = /\bpresent\b/i.test(primary) || /\bpresent\b/i.test(raw);

    const month =
      "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
    const part = `(?:${month}\\s+\\d{4}|\\d{4})`;
    const rangeRe = new RegExp(
      `(${part})\\s*[-–—]\\s*(${part}|Present)`,
      "i",
    );
    const range = primary.match(rangeRe) || raw.match(rangeRe);

    let startedOn = null;
    let endedOn = null;
    if (range) {
      startedOn = range[1].replace(/\s+/g, " ").trim();
      endedOn = /present/i.test(range[2])
        ? null
        : range[2].replace(/\s+/g, " ").trim();
    } else {
      const single = primary.match(
        new RegExp(`^(${month}\\s+\\d{4}|\\d{4})$`, "i"),
      );
      if (single) {
        startedOn = single[1].replace(/\s+/g, " ").trim();
        if (isCurrent) endedOn = null;
      }
    }

    return {
      startedOn,
      endedOn,
      isCurrent: Boolean(isCurrent),
      startedOnSort: toSortMonth(startedOn),
      endedOnSort: isCurrent ? null : toSortMonth(endedOn),
    };
  }

  function parseConnectionCountText(raw) {
    const text = String(raw || "").replace(/\s+/g, " ").trim();
    if (!text) return null;
    const m =
      text.match(/([\d,]+)\+?\s*connections?/i) ||
      text.match(/^([\d,]+)\+?$/);
    if (!m) return null;
    const rawLabel = /connection/i.test(text)
      ? text.match(/[\d,]+\+?\s*connections?/i)?.[0] || text
      : text;
    const n = parseInt(m[1].replace(/,/g, ""), 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return {
      connectionCount: n,
      connectionCountRaw: rawLabel.includes("+")
        ? rawLabel
        : text.includes("+")
          ? `${n}+`
          : String(n),
    };
  }

  function scrapeConnectionCountFromCode() {
    const html = document.documentElement.innerHTML.slice(0, 900000);
    const patterns = [
      /"connectionsCount"\s*:\s*(\d+)/i,
      /"followerCount"\s*:\s*(\d+)/i,
      /"connectionCount"\s*:\s*(\d+)/i,
      /(\d{2,})\+?\s*connections/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (!m) continue;
      const n = parseInt(m[1].replace(/,/g, ""), 10);
      if (!Number.isFinite(n) || n <= 0) continue;
      const plus = /\+/.test(m[0]);
      return {
        connectionCount: n,
        connectionCountRaw: plus ? `${n}+` : String(n),
      };
    }
    return null;
  }

  function scrapeConnectionCountDom() {
    const selectors = [
      'a[href*="/overlay/contact-info/"]',
      'a[href*="connections"]',
      'a[href*="/search/results/people"]',
      "span.t-bold",
      ".pv-top-card--list-bullet li",
      ".pv-top-card__connections",
      "main .text-body-small",
    ];
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (SecureCRM.isOurUi?.(el)) continue;
        const parsed = parseConnectionCountText(SecureCRM.text(el));
        if (parsed && parsed.connectionCount >= 1) return parsed;
      }
    }
    // Broader top-card scan
    const top =
      document.querySelector("main section") ||
      document.querySelector(".pv-top-card") ||
      document.querySelector("main");
    if (top) {
      const blob = SecureCRM.text(top).slice(0, 1200);
      const parsed = parseConnectionCountText(
        blob.match(/[\d,]+\+?\s*connections?/i)?.[0] || "",
      );
      if (parsed) return parsed;
    }
    return scrapeConnectionCountFromCode();
  }

  function firstCleanText(selectors) {
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        if (SecureCRM.isOurUi?.(el)) continue;
        const value = SecureCRM.text(el);
        if (value && !SecureCRM.isNoiseText?.(value)) return value;
      }
    }
    return "";
  }

  function scrapeProfileDom() {
    const slug = profileSlugFromUrl();
    const h1 = firstCleanText([
      "main h1",
      "h1.text-heading-xlarge",
      ".text-heading-xlarge",
      "h1",
    ]);

    const titleMeta =
      document.querySelector('meta[property="og:title"]')?.content ||
      document.title.replace(/\s*\|\s*LinkedIn.*$/i, "").trim();

    const fullName = h1 || titleMeta;
    if (SecureCRM.isNoiseText?.(fullName)) return null;

    const headline =
      firstCleanText([
        "main .text-body-medium.break-words",
        ".pv-text-details__left-panel .text-body-medium",
        ".text-body-medium.break-words",
      ]) ||
      document.querySelector('meta[property="og:description"]')?.content ||
      "";

    const location =
      firstCleanText([
        "span.text-body-small.inline.t-black--light.break-words",
        ".pv-text-details__left-panel .text-body-small:not(.inline)",
      ]) || "";

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
    const media = scrapeProfileMedia();
    return {
      linkedinUrl: SecureCRM.normalizeLinkedIn(location.href),
      fullName,
      jobTitle: jobTitle || null,
      companyName,
      industry: null,
      website: null,
      location: location || null,
      headline: headline || null,
      metadata: {
        page: "profile_dom",
        photoUrl: media.photoUrl,
        companyLogoUrl: media.companyLogoUrl,
        bio: media.bio,
      },
    };
  }

  function scrapeExperiences(trainedRootCss) {
    const experiences = [];
    const trainedRoots = [];
    if (trainedRootCss) {
      try {
        trainedRoots.push(...document.querySelectorAll(trainedRootCss));
      } catch {
        /* ignore bad recipe */
      }
    }
    // Prefer trained experience root before fragile LinkedIn defaults
    const roots = [
      ...trainedRoots,
      ...document.querySelectorAll(
        "#experience ~ div.pvs-list__outer-container, #experience ~ div, #experience + div",
      ),
      ...document.querySelectorAll(
        'section[id*="experience" i], section[data-section="experience"], section.experience-section',
      ),
      ...document.querySelectorAll(
        '.pvs-list__container, [id="experience"] ~ * .pvs-list',
      ),
    ];

    const rawCards = new Set();
    for (const root of roots) {
      for (const li of root.querySelectorAll(
        "li, .pvs-entity, [data-view-name='profile-component-entity']",
      )) {
        rawCards.add(li);
      }
    }

    if (!rawCards.size) {
      for (const li of document.querySelectorAll("main li")) {
        const t = SecureCRM.text(li).slice(0, 200);
        if (/present|·|–|-|\d{4}/i.test(t) && t.length > 20) rawCards.add(li);
      }
    }

    // Expand nested multi-role company blocks into role cards; skip wrappers
    const cards = new Set();
    for (const card of rawCards) {
      const nested = [
        ...card.querySelectorAll(
          ":scope > div ul > li, :scope ul.pvs-list > li, :scope .pvs-entity__sub-components li",
        ),
      ].filter((n) => n !== card);
      const nestedWithDates = nested.filter((n) => {
        const t = SecureCRM.text(n).slice(0, 240);
        return /\d{4}|present/i.test(t) && t.length > 12;
      });
      if (nestedWithDates.length >= 1) {
        for (const n of nestedWithDates) cards.add(n);
      } else {
        cards.add(card);
      }
    }

    let order = 0;
    for (const card of cards) {
      if (SecureCRM.isOurUi?.(card)) continue;
      const text = SecureCRM.text(card).slice(0, 500);
      if (!text || text.length < 8) continue;
      if (/^see more|^show all|^show fewer/i.test(text)) continue;
      if (SecureCRM.isNoiseText?.(text)) continue;

      const title =
        SecureCRM.text(
          card.querySelector(
            '.t-bold span[aria-hidden="true"], .mr1.t-bold span[aria-hidden="true"], h3 span[aria-hidden="true"], h3, .hoverable-link-text span[aria-hidden="true"], .hoverable-link-text',
          ),
        ) ||
        text.split(/[·|]/)[0]?.trim() ||
        null;

      const companyLink =
        card.querySelector('a[href*="/company/"]') ||
        card.parentElement?.closest?.("li")?.querySelector?.('a[href*="/company/"]') ||
        null;
      let companyName =
        SecureCRM.text(
          card.querySelector(
            '.t-14.t-normal span[aria-hidden="true"], .t-14.t-normal:not(.t-black--light)',
          ),
        ) ||
        SecureCRM.text(companyLink) ||
        null;
      // Nested role: company often lives on parent entity
      if (!companyName) {
        const parentEntity = card.closest(
          "[data-view-name='profile-component-entity']",
        );
        if (parentEntity && parentEntity !== card) {
          companyName =
            SecureCRM.text(
              parentEntity.querySelector(
                '.t-bold span[aria-hidden="true"], a[href*="/company/"] span[aria-hidden="true"]',
              ),
            ) || companyName;
        }
      }

      const logoImg =
        card.querySelector('a[href*="/company/"] img') ||
        card.querySelector(".pvs-entity__image-container img") ||
        card.querySelector("img.evi-image") ||
        card
          .closest("[data-view-name='profile-component-entity']")
          ?.querySelector?.("img.evi-image, .pvs-entity__image-container img");
      const companyLogoUrl = absMediaUrl(
        logoImg?.src || logoImg?.getAttribute("src"),
      );

      const dateLine =
        SecureCRM.text(
          card.querySelector(
            '.pvs-entity__caption-wrapper, span.pvs-entity__caption-wrapper, .t-14.t-normal.t-black--light span[aria-hidden="true"], .t-14.t-normal.t-black--light',
          ),
        ) || "";
      const dates = parseExperienceDates(dateLine, text);

      // Location: often the line after the date range
      const lightLines = [
        ...card.querySelectorAll(
          ".t-14.t-normal.t-black--light span[aria-hidden='true'], .t-14.t-normal.t-black--light",
        ),
      ]
        .map((el) => SecureCRM.text(el))
        .filter(Boolean);
      let location = null;
      for (const line of lightLines) {
        if (line === dateLine) continue;
        if (/\d{4}|present|·\s*\d/i.test(line) && /[-–—]/.test(line)) continue;
        if (line.length > 2 && line.length < 120) {
          location = line;
          break;
        }
      }

      if (!title && !companyName) continue;
      if (/^activity|^about|^education|^licenses|^skills/i.test(title || "")) {
        continue;
      }

      experiences.push({
        title,
        companyName,
        companyLinkedinUrl: companyLink?.href || null,
        companyLogoUrl,
        location,
        startedOn: dates.startedOn,
        endedOn: dates.endedOn,
        startedOnSort: dates.startedOnSort,
        endedOnSort: dates.endedOnSort,
        isCurrent: dates.isCurrent,
        rawText: text,
        sortOrder: order++,
      });
      if (experiences.length >= 40) break;
    }

    const seen = new Set();
    return experiences.filter((e) => {
      const k = `${(e.title || "").toLowerCase()}|${(e.companyName || "").toLowerCase()}|${e.startedOn || ""}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  async function scrapeProfile() {
    const slug = profileSlugFromUrl();
    const fromCode = scrapeFromEmbeddedCode(slug);
    const fromDom = scrapeProfileDom();
    if (!fromCode && !fromDom) return null;

    let fields = {};
    try {
      fields = (await SecureCRMRecipe?.loadRecipe?.("linkedin")) || {};
    } catch {
      fields = {};
    }

    const trained = {
      fullName: SecureCRMRecipe?.applyField?.(fields, "fullName"),
      jobTitle: SecureCRMRecipe?.applyField?.(fields, "jobTitle"),
      companyName: SecureCRMRecipe?.applyField?.(fields, "companyName"),
      location: SecureCRMRecipe?.applyField?.(fields, "location"),
      headline: SecureCRMRecipe?.applyField?.(fields, "headline"),
      connectionCount: SecureCRMRecipe?.applyField?.(fields, "connectionCount"),
    };

    const experiences = scrapeExperiences(fields?.experienceRoot?.css);
    const current = experiences.find((e) => e.isCurrent) || experiences[0];
    const media = scrapeProfileMedia();
    const photoUrl =
      media.photoUrl || fromDom?.metadata?.photoUrl || null;
    const companyLogoUrl =
      media.companyLogoUrl ||
      current?.companyLogoUrl ||
      fromDom?.metadata?.companyLogoUrl ||
      null;
    const bio = media.bio || fromDom?.metadata?.bio || null;

    const trainedConnections = parseConnectionCountText(trained.connectionCount);
    const connections = trainedConnections || scrapeConnectionCountDom();

    return {
      linkedinUrl:
        fromDom?.linkedinUrl ||
        fromCode?.linkedinUrl ||
        SecureCRM.normalizeLinkedIn(location.href),
      fullName:
        trained.fullName || fromDom?.fullName || fromCode?.fullName,
      jobTitle:
        trained.jobTitle ||
        fromDom?.jobTitle ||
        fromCode?.jobTitle ||
        current?.title ||
        null,
      companyName:
        trained.companyName ||
        fromDom?.companyName ||
        fromCode?.companyName ||
        current?.companyName ||
        null,
      industry: fromDom?.industry || fromCode?.industry || null,
      website: fromDom?.website || fromCode?.website || null,
      location:
        trained.location || fromDom?.location || fromCode?.location || null,
      headline:
        trained.headline || fromDom?.headline || fromCode?.headline || null,
      experiences,
      metadata: {
        page: "profile",
        sources: [
          fromDom && "dom",
          fromCode && "code",
          experiences.length && "experience",
          photoUrl && "photo",
          companyLogoUrl && "logo",
          bio && "bio",
          connections && "connections",
        ].filter(Boolean),
        recipeFields: Object.keys(fields),
        photoUrl,
        companyLogoUrl,
        bio,
        ...(connections
          ? {
              connectionCount: connections.connectionCount,
              connectionCountRaw: connections.connectionCountRaw,
            }
          : {}),
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

      if (SecureCRM.isOurUi?.(link) || SecureCRM.isOurUi?.(card)) continue;

      const ariaName = SecureCRM.text(
        link.querySelector('span[aria-hidden="true"]'),
      );
      let visibleName =
        ariaName ||
        SecureCRM.text(link).replace(/View .+ profile/i, "").trim();
      if (SecureCRM.isNoiseText?.(visibleName)) visibleName = "";

      const cardText = SecureCRM.text(card).slice(0, 400);
      const lines = SecureCRM.cleanLines?.(
        cardText.split(/(?<=[.!?])\s+|\n|·/).map((s) => s.trim()),
      ) ||
        cardText
          .split(/(?<=[.!?])\s+|\n|·/)
          .map((s) => s.trim())
          .filter(Boolean);

      let fullName = visibleName;
      if (!fullName || fullName.length < 2 || /linkedin|connect|follow/i.test(fullName)) {
        fullName =
          lines.find(
            (l) =>
              l.length > 2 &&
              l.length < 80 &&
              !/^\d/.test(l) &&
              !SecureCRM.isNoiseText?.(l),
          ) || "";
      }
      if (!fullName) {
        const slug = profileSlugFromUrl(linkedinUrl);
        fullName = slug ? slug.replace(/-/g, " ") : "";
      }
      if (!fullName || SecureCRM.isNoiseText?.(fullName)) continue;

      let jobTitle = null;
      let companyName = null;
      let location = null;
      const primary =
        lines.find(
          (l) =>
            l !== fullName &&
            !SecureCRM.isNoiseText?.(l) &&
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

      const locLine = lines.find(
        (l) =>
          /,/.test(l) &&
          l !== fullName &&
          l !== primary &&
          !SecureCRM.isNoiseText?.(l),
      );
      if (locLine) location = locLine;

      // Prefer embedded code for this slug when available
      const slug = profileSlugFromUrl(linkedinUrl);
      const coded = slug ? scrapeFromEmbeddedCode(slug) : null;

      const avatarImg =
        card?.querySelector?.(
          'img.presence-entity__image, img.evi-image, img.ivm-view-attr__img--centered, img[src*="profile"], img[src*="shrink"]',
        ) || null;
      const photoUrl = absMediaUrl(
        avatarImg?.src || avatarImg?.getAttribute("src"),
      );

      leads.push({
        linkedinUrl,
        fullName: coded?.fullName || fullName,
        jobTitle: coded?.jobTitle || jobTitle,
        companyName: coded?.companyName || companyName,
        industry: null,
        website: null,
        location: coded?.location || location,
        headline: coded?.headline || primary || null,
        metadata: {
          page: "search_links",
          slug,
          ...(photoUrl ? { photoUrl } : {}),
        },
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
    let lead = await scrapeProfile();
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

  function createProfileEnricher() {
    return new KineticEnrichment({
      source: SOURCE,
      overwriteMismatches: true,
      scrape: async () => {
        await sleep(400);
        const lead = await scrapeProfile();
        if (!lead) return null;
        return {
          ...lead,
          metadata: { ...(lead.metadata || {}), enrich: true },
        };
      },
    });
  }

  async function enrichCurrentProfile() {
    SecureCRMPanel.setStatus("Enriching from profile…");
    const enricher = createProfileEnricher();
    const result = await enricher.run();
    SecureCRMPanel.setStatus(KineticEnrichment.formatReport(result));
    try {
      SecureCRMBadges?.refresh?.();
    } catch {
      /* ignore */
    }
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
          {
            id: "enrich",
            label: "Enrich from page",
            onClick: () =>
              enrichCurrentProfile().catch((e) =>
                SecureCRMPanel.setStatus(e.message),
              ),
          },
          {
            id: "train",
            label: "Train mode",
            onClick: async () => {
              const on = await SecureCRMTrain?.toggle?.();
              SecureCRMPanel.setStatus(
                on
                  ? "Train mode on — click page text, then pick a field."
                  : "Train mode off.",
              );
            },
          },
        ],
        { title: "KINETIC · LinkedIn profile" },
      );
      SecureCRMPanel.setStatus("Profile ready — Capture or Enrich.");
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
          id: "deep",
          label: "Deep scrape profiles",
          onClick: () => {
            const urls = scrapeSearchResults()
              .map((l) => l.linkedinUrl)
              .filter(Boolean);
            chrome.runtime.sendMessage({
              type: "START_DEEP_SCRAPE",
              urls,
            });
            SecureCRMPanel.setStatus(
              `Queued ${urls.length} profiles for deep scrape…`,
            );
          },
        },
        {
          id: "stop",
          label: "Stop bulk / deep",
          onClick: () => {
            bulkRunning = false;
            chrome.runtime.sendMessage({ type: "STOP_DEEP_SCRAPE" });
            SecureCRMPanel.setStatus("Stopped.");
          },
        },
        {
          id: "train",
          label: "Train mode",
          onClick: async () => {
            const on = await SecureCRMTrain?.toggle?.();
            SecureCRMPanel.setStatus(
              on
                ? "Train mode on — click page text, then pick a field."
                : "Train mode off.",
            );
          },
        },
        {
          id: "badges",
          label: "Refresh CRM badges",
          onClick: () => SecureCRMBadges.refresh(),
        },
      ],
      { title: "KINETIC · LinkedIn search" },
    );
  }

  function onUrlMaybeChanged() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    mountFab(true);
    SecureCRMBadges.refresh();
    if (isProfilePage()) {
      setTimeout(() => {
        scrapeProfile()
          .then((lead) => {
            SecureCRMPanel.setStatus(
              lead?.fullName
                ? `Opened ${lead.fullName} — ready to capture.`
                : "Profile opened — ready to capture.",
            );
          })
          .catch(() =>
            SecureCRMPanel.setStatus("Profile opened — ready to capture."),
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

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "SCRM_SCRAPE_PROFILE") {
      (async () => {
        try {
          await sleep(500);
          const lead = await scrapeProfile();
          if (!lead?.fullName) {
            sendResponse({ ok: false, error: "Could not scrape profile" });
            return;
          }
          sendResponse({ ok: true, lead });
        } catch (e) {
          sendResponse({ ok: false, error: e.message || "Scrape failed" });
        }
      })();
      return true;
    }
    if (msg?.type === "SCRM_COLLECT_SEARCH_URLS") {
      try {
        const urls = scrapeSearchResults()
          .map((l) => l.linkedinUrl)
          .filter(Boolean);
        sendResponse({ ok: true, urls });
      } catch (e) {
        sendResponse({ ok: false, error: e.message, urls: [] });
      }
      return false;
    }
    return false;
  });
})();
