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

  function applyField(fields, key) {
    const rule = fields?.[key];
    if (!rule?.css) return null;
    try {
      const el = document.querySelector(rule.css);
      if (!el) return null;
      if (rule.attribute) {
        return (el.getAttribute(rule.attribute) || "").trim() || null;
      }
      let text = SecureCRM.text(el);
      if (rule.regex) {
        const m = text.match(new RegExp(rule.regex));
        if (m) text = m[1] || m[0];
      }
      return text || null;
    } catch {
      return null;
    }
  }

  function esc(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function buildCssPath(el) {
    if (!(el instanceof Element)) return "";
    const parts = [];
    let node = el;
    for (let depth = 0; node && node.nodeType === 1 && depth < 6; depth++) {
      let part = node.nodeName.toLowerCase();
      if (node.id && /^[a-zA-Z][\w:-]*$/.test(node.id) && !/^\d/.test(node.id)) {
        parts.unshift(`#${node.id}`);
        break;
      }
      const testId =
        node.getAttribute("data-test-id") ||
        node.getAttribute("data-anonymize") ||
        node.getAttribute("data-field");
      if (testId) {
        const attr = node.hasAttribute("data-anonymize")
          ? "data-anonymize"
          : node.hasAttribute("data-field")
            ? "data-field"
            : "data-test-id";
        parts.unshift(`${part}[${attr}="${esc(testId)}"]`);
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter(
          (c) => c.nodeName === node.nodeName,
        );
        if (siblings.length > 1) {
          const idx = siblings.indexOf(node) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(part);
      node = parent;
    }
    return parts.join(" > ");
  }

  async function saveFields(source, fields) {
    const data = await SecureCRM.crmFetch("/api/extension/scrape-recipe", {
      method: "PUT",
      body: JSON.stringify({ source, fields, merge: true }),
    });
    invalidate();
    return data;
  }

  window.SecureCRMRecipe = {
    loadRecipe,
    applyField,
    buildCssPath,
    saveFields,
    invalidate,
  };
})();
