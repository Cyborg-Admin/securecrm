(() => {
  let cache = { source: null, fields: {}, loadedAt: 0 };

  async function loadRecipe(source = "linkedin") {
    const now = Date.now();
    if (cache.source === source && now - cache.loadedAt < 60_000) {
      return cache.fields;
    }
    try {
      const data = await SecureCRM.crmFetch(
        `/api/extension/scrape-recipe?source=${encodeURIComponent(source)}`,
      );
      cache = {
        source,
        fields: data.recipe?.fields || {},
        loadedAt: now,
      };
    } catch {
      cache = { source, fields: {}, loadedAt: now };
    }
    return cache.fields;
  }

  function invalidate() {
    cache = { source: null, fields: {}, loadedAt: 0 };
  }

  function readElementValue(el, rule) {
    if (!el) return null;
    if (rule?.attribute) {
      return (el.getAttribute(rule.attribute) || "").trim() || null;
    }
    let text = SecureCRM.text(el);
    if (rule?.regex) {
      try {
        const m = text.match(new RegExp(rule.regex));
        if (m) text = m[1] || m[0];
      } catch {
        /* ignore bad regex */
      }
    }
    return text || null;
  }

  function applyField(fields, key) {
    const rule = fields?.[key];
    if (!rule?.css) return null;
    try {
      const nodes = document.querySelectorAll(rule.css);
      for (const el of nodes) {
        if (SecureCRM.isOurUi?.(el)) continue;
        const value = readElementValue(el, rule);
        if (value && !SecureCRM.isNoiseText?.(value)) return value;
      }
      return null;
    } catch {
      return null;
    }
  }

  function esc(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function isUnstableId(id) {
    if (!id) return true;
    // LinkedIn ember + other auto-generated IDs break on every navigation
    if (/^ember\d+/i.test(id)) return true;
    if (/^ember-/i.test(id)) return true;
    if (/^\d/.test(id)) return true;
    if (/^[0-9a-f]{8,}$/i.test(id)) return true;
    if (id.length > 64) return true;
    return false;
  }

  function isUnstableClass(cls) {
    if (!cls) return true;
    if (/^ember/i.test(cls)) return true;
    if (/^[a-z]?[A-Z0-9_-]{10,}$/.test(cls) && /[0-9]/.test(cls)) return true;
    if (cls.length > 40) return true;
    return false;
  }

  function stableClass(node) {
    const list = [...(node.classList || [])].filter((c) => !isUnstableClass(c));
    // Prefer LinkedIn design-system-ish utilities
    const preferred = list.find((c) =>
      /^(text-|t-|break-|inline|hoverable|artdeco|pv-|pvs-|scaffold)/i.test(c),
    );
    return preferred || list[0] || null;
  }

  function attrSelector(node) {
    const pairs = [
      ["data-anonymize", node.getAttribute("data-anonymize")],
      ["data-field", node.getAttribute("data-field")],
      ["data-test-id", node.getAttribute("data-test-id")],
      ["data-view-name", node.getAttribute("data-view-name")],
      ["aria-label", node.getAttribute("aria-label")],
    ];
    for (const [attr, value] of pairs) {
      if (!value || value.length > 80) continue;
      // Skip labels that include the person's name (too specific / brittle)
      if (attr === "aria-label" && /view .+[’']s profile/i.test(value)) continue;
      return `${node.nodeName.toLowerCase()}[${attr}="${esc(value)}"]`;
    }
    return null;
  }

  function buildCssPath(el) {
    if (!(el instanceof Element)) return "";

    // Prefer meaningful text-bearing leaf targets LinkedIn keeps stable
    const parts = [];
    let node = el;
    for (let depth = 0; node && node.nodeType === 1 && depth < 8; depth++) {
      const tag = node.nodeName.toLowerCase();

      if (node.id && !isUnstableId(node.id) && /^[a-zA-Z][\w:-]*$/.test(node.id)) {
        parts.unshift(`#${node.id}`);
        break;
      }

      const byAttr = attrSelector(node);
      if (byAttr) {
        parts.unshift(byAttr);
        // Keep one parent context when attribute is generic
        if (depth === 0 && node.parentElement) {
          const parentCls = stableClass(node.parentElement);
          if (parentCls) {
            parts.unshift(
              `${node.parentElement.nodeName.toLowerCase()}.${parentCls}`,
            );
          }
        }
        break;
      }

      let part = tag;
      const cls = stableClass(node);
      if (cls) part += `.${cls}`;

      const parent = node.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((c) => {
          if (c.nodeName !== node.nodeName) return false;
          if (!cls) return true;
          return c.classList?.contains(cls);
        });
        if (siblings.length > 1) {
          const idx = siblings.indexOf(node) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }

      parts.unshift(part);

      // Early stop on landmarks
      if (
        tag === "main" ||
        tag === "section" ||
        node.getAttribute("role") === "main" ||
        (node.id && !isUnstableId(node.id))
      ) {
        break;
      }
      node = parent;
    }

    let path = parts.join(" > ");
    if (path.length > 480) {
      // Keep the most specific tail
      path = parts.slice(-4).join(" > ");
    }
    return path;
  }

  async function saveFields(source, fields) {
    const data = await SecureCRM.crmFetch("/api/extension/scrape-recipe", {
      method: "PUT",
      body: JSON.stringify({ source, fields, merge: true }),
    });
    invalidate();
    return data;
  }

  function detectSource() {
    const href = location.href;
    if (/linkedin\.com\/sales\//i.test(href)) return "salesnav";
    if (/cognism\.com/i.test(href)) return "cognism";
    if (/mail\.google\.com/i.test(href)) return "gmail";
    return "linkedin";
  }

  window.SecureCRMRecipe = {
    loadRecipe,
    applyField,
    buildCssPath,
    saveFields,
    invalidate,
    detectSource,
  };
})();
