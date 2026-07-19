(() => {
  const ATTR = "data-scrm-badge";
  let timer = null;
  let lastKey = "";

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

  function clearBadges() {
    document
      .querySelectorAll(`.scrm-crm-badge[${ATTR}]`)
      .forEach((el) => el.remove());
  }

  function attachBadge(anchor, info) {
    if (!info?.inCrm) return;
    const sibling = anchor.nextElementSibling;
    if (
      sibling?.classList?.contains("scrm-crm-badge") &&
      sibling.getAttribute(ATTR) === String(info.id || "1")
    ) {
      return;
    }
    const badge = document.createElement("span");
    badge.className = "scrm-crm-badge";
    badge.setAttribute(ATTR, info.id || "1");
    badge.title = `${info.fullName || "In CRM"} · ${info.entityType || "lead"}${
      info.status ? ` · ${info.status}` : ""
    }`;
    badge.textContent = info.entityType === "contact" ? "CRM ✓" : "Lead";
    badge.dataset.entity = info.entityType || "lead";
    anchor.insertAdjacentElement("afterend", badge);
  }

  async function refresh() {
    const cfg = await SecureCRM.getConfig();
    if (!cfg.showBadges) {
      clearBadges();
      return;
    }
    if (!cfg.apiKey) return;

    const map = collectProfileAnchors();
    const apiUrls = [...map.values()].map((v) => v.url).slice(0, 120);
    const key = apiUrls.slice(0, 40).join("|");
    if (key === lastKey && document.querySelector(".scrm-crm-badge")) return;
    lastKey = key;
    if (!apiUrls.length) return;

    try {
      const { results } = await SecureCRM.lookupLinkedIn(apiUrls);
      for (const [uid, entry] of map.entries()) {
        const info = results?.[uid];
        if (!info?.inCrm) continue;
        for (const a of entry.anchors.slice(0, 2)) {
          attachBadge(a, info);
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
  }

  window.SecureCRMBadges = { start, refresh, clearBadges };
})();
