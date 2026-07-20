(() => {
  const ATTR = "data-scrm-badge";
  const WRAP_ATTR = "data-scrm-wrap";
  const PROFILE_ID = "scrm-profile-status";
  let timer = null;
  let lastKey = "";

  function isProfilePage() {
    return /linkedin\.com\/in\/[^/?#]+/i.test(location.pathname);
  }

  function isSearchishPage() {
    return (
      /\/search\//i.test(location.pathname) ||
      /\/results\//i.test(location.pathname) ||
      /\/mynetwork\//i.test(location.pathname) ||
      /\/people\//i.test(location.pathname)
    );
  }

  function collectProfileAnchors() {
    const anchors = [
      ...document.querySelectorAll('a[href*="/in/"]'),
      ...document.querySelectorAll('a[href*="linkedin.com/in/"]'),
    ];
    const map = new Map();
    for (const a of anchors) {
      const href = a.href || a.getAttribute("href") || "";
      if (!/\/in\//i.test(href)) continue;
      if (/\/in\/ACo|\/in\/AEMA|\/pub\/dir\//i.test(href)) continue;
      const url = SecureCRM.normalizeLinkedIn(href);
      if (!url) continue;
      const uid = SecureCRM.linkedInUid(url);
      if (!map.has(uid)) map.set(uid, { url, anchors: [] });
      map.get(uid).anchors.push(a);
    }
    return map;
  }

  function labelFor(info) {
    if (!info?.inCrm) return { text: "Not in CRM", entity: "missing" };
    if (info.entityType === "contact") {
      return { text: "Contact", entity: "contact" };
    }
    return { text: "Lead", entity: "lead" };
  }

  function clearBadges() {
    document
      .querySelectorAll(`.scrm-crm-badge[${ATTR}], .scrm-profile-status, .scrm-avatar-wrap[${WRAP_ATTR}]`)
      .forEach((el) => {
        if (el.classList.contains("scrm-avatar-wrap")) {
          const img = el.querySelector("img");
          if (img && el.parentElement) {
            el.parentElement.insertBefore(img, el);
          }
          el.remove();
          return;
        }
        el.remove();
      });
    document.getElementById(PROFILE_ID)?.remove();
  }

  function findProfileMount() {
    // Top-right rail sits above Follow / “More profiles” widgets.
    const aside =
      document.querySelector("main .scaffold-layout__aside") ||
      document.querySelector(".scaffold-layout__aside") ||
      document.querySelector("aside.scaffold-layout__aside");
    if (aside) return { mount: aside, mode: "aside" };

    // Fallback: above Activity / Follow in the main column
    const activity =
      document.querySelector("#content_collections")?.closest("section") ||
      document.querySelector('section[componentkey*="Activity" i]') ||
      [...document.querySelectorAll("main section.artdeco-card")].find((s) =>
        /activity/i.test(SecureCRM.text(s.querySelector("h2, h3")) || ""),
      );
    if (activity?.parentElement) {
      return { mount: activity.parentElement, mode: "before-activity", before: activity };
    }

    const main =
      document.querySelector("main .scaffold-layout__main") ||
      document.querySelector("main");
    if (main) return { mount: main, mode: "main" };
    return null;
  }

  function mountProfileStatus(info) {
    const found = findProfileMount();
    if (!found) return;

    const { text, entity } = labelFor(info);
    let el = document.getElementById(PROFILE_ID);
    if (!el) {
      el = document.createElement("div");
      el.id = PROFILE_ID;
      el.className = "scrm-profile-status";
      if (found.mode === "before-activity" && found.before) {
        found.before.parentElement.insertBefore(el, found.before);
      } else if (found.mount.firstChild) {
        found.mount.insertBefore(el, found.mount.firstChild);
      } else {
        found.mount.appendChild(el);
      }
    }

    el.dataset.entity = entity;
    el.dataset.placement = found.mode;
    const sub = info?.inCrm
      ? [info.fullName, info.status].filter(Boolean).join(" · ")
      : "Capture to add this profile";
    el.innerHTML = `
      <span class="scrm-profile-status-kicker">KINETIC</span>
      <span class="scrm-profile-status-label">${text}</span>
      <span class="scrm-profile-status-sub">${sub}</span>
    `;
    el.title = info?.inCrm
      ? `${info.fullName || "In CRM"} · ${info.entityType || "lead"}`
      : "Not in KINETIC CRM";
  }

  function findAvatarNear(anchor) {
    const card =
      anchor.closest("li") ||
      anchor.closest(".reusable-search__result-container") ||
      anchor.closest(".entity-result") ||
      anchor.closest("[data-chameleon-result-urn]") ||
      anchor.closest(".artdeco-entity-lockup") ||
      anchor.parentElement;

    if (!card) return null;
    const imgs = [
      ...card.querySelectorAll(
        'img.presence-entity__image, img.evi-image, img.ivm-view-attr__img--centered, img[src*="profile"], img[src*="shrink"]',
      ),
    ];
    // Prefer circular/small headshots over logos
    return (
      imgs.find((img) => {
        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        return w > 0 && h > 0 && Math.abs(w - h) < 40;
      }) ||
      imgs[0] ||
      null
    );
  }

  function wrapAvatar(img, info) {
    if (!img || img.closest(`[${WRAP_ATTR}]`)) {
      const existing = img?.closest(`[${WRAP_ATTR}]`);
      if (existing) {
        const { text, entity } = labelFor(info);
        existing.dataset.entity = entity;
        const label = existing.querySelector(".scrm-avatar-label");
        if (label) label.textContent = text;
      }
      return;
    }

    const { text, entity } = labelFor(info);
    const wrap = document.createElement("span");
    wrap.className = "scrm-avatar-wrap";
    wrap.setAttribute(WRAP_ATTR, info?.id || entity);
    wrap.dataset.entity = entity;
    wrap.title = info?.inCrm
      ? `${info.fullName || "In CRM"} · ${info.entityType}`
      : "Not in KINETIC CRM";

    const parent = img.parentElement;
    if (!parent) return;
    parent.insertBefore(wrap, img);
    wrap.appendChild(img);

    const label = document.createElement("span");
    label.className = "scrm-avatar-label";
    label.textContent = text;
    wrap.appendChild(label);
  }

  function attachSearchBadges(anchors, info) {
    for (const a of anchors.slice(0, 3)) {
      const img = findAvatarNear(a);
      if (img) {
        wrapAvatar(img, info);
        continue;
      }
      // Fallback: pill next to name link
      if (
        a.nextElementSibling?.classList?.contains("scrm-crm-badge") &&
        a.nextElementSibling.getAttribute(ATTR)
      ) {
        continue;
      }
      const { text, entity } = labelFor(info);
      const badge = document.createElement("span");
      badge.className = "scrm-crm-badge";
      badge.setAttribute(ATTR, info?.id || entity);
      badge.dataset.entity = entity;
      badge.textContent = text;
      a.insertAdjacentElement("afterend", badge);
    }
  }

  async function refresh() {
    const cfg = await SecureCRM.getConfig();
    if (!cfg.showBadges) {
      clearBadges();
      return;
    }
    if (!cfg.apiKey) return;

    const map = collectProfileAnchors();
    let apiUrls = [...map.values()].map((v) => v.url).slice(0, 120);

    // Always include current profile URL on profile pages
    if (isProfilePage()) {
      const selfUrl = SecureCRM.normalizeLinkedIn(location.href);
      if (selfUrl && !apiUrls.includes(selfUrl)) apiUrls = [selfUrl, ...apiUrls];
    }

    const key = `${location.pathname}|${apiUrls.slice(0, 40).join("|")}`;
    if (
      key === lastKey &&
      (document.querySelector(".scrm-avatar-wrap") ||
        document.getElementById(PROFILE_ID))
    ) {
      return;
    }
    lastKey = key;
    if (!apiUrls.length) return;

    try {
      const { results } = await SecureCRM.lookupLinkedIn(apiUrls);

      if (isProfilePage()) {
        const uid = SecureCRM.linkedInUid(location.href);
        const info = results?.[uid] || { inCrm: false };
        mountProfileStatus(info);
      }

      // Search / list cards — wrap headshots for every looked-up profile
      for (const [uid, entry] of map.entries()) {
        // Skip self-link spam on profile page for avatar wraps (profile status covers it)
        if (isProfilePage() && uid === SecureCRM.linkedInUid(location.href)) {
          continue;
        }
        const info = results?.[uid] || { inCrm: false };
        // Show both in-CRM and not-in-CRM for clear visibility on search
        if (isSearchishPage() || !isProfilePage()) {
          attachSearchBadges(entry.anchors, info);
        } else if (info.inCrm) {
          attachSearchBadges(entry.anchors, info);
        }
      }
    } catch {
      // Quiet — bad API key / offline
    }
  }

  function schedule(ms = 900) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      refresh().catch(() => {});
    }, ms);
  }

  function start() {
    schedule(400);
    const obs = new MutationObserver(() => schedule(1200));
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setInterval(() => schedule(400), 8000);
    window.addEventListener("popstate", () => {
      lastKey = "";
      schedule(300);
    });
  }

  window.SecureCRMBadges = { start, refresh, clearBadges };
})();
