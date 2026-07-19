/**
 * KineticEnrichment — reusable enrichment runner for the extension.
 *
 * Designed for:
 *  - Manual FAB "Enrich" actions today
 *  - Automated / scheduled enrichment later (same class, dryRun / batch)
 *
 * Usage:
 *   const enricher = new KineticEnrichment({
 *     source: "linkedin",
 *     scrape: async () => ({ linkedinUrl, fullName, jobTitle, ... }),
 *   });
 *   await enricher.run();                  // preview + apply
 *   await enricher.run({ dryRun: true });  // analyze only
 */
(() => {
  class KineticEnrichment {
    /**
     * @param {{
     *   source?: string,
     *   scrape: () => Promise<object|null>|object|null,
     *   crm?: typeof window.SecureCRM,
     *   overwriteMismatches?: boolean,
     * }} opts
     */
    constructor(opts) {
      if (!opts || typeof opts.scrape !== "function") {
        throw new Error("KineticEnrichment requires a scrape() function");
      }
      this.source = opts.source || "linkedin";
      this.scrapeFn = opts.scrape;
      this.crm = opts.crm || window.SecureCRM;
      this.overwriteMismatches = opts.overwriteMismatches !== false;
      this.lastScraped = null;
      this.lastPlan = null;
    }

    async scrape() {
      const person = await this.scrapeFn();
      if (!person?.linkedinUrl && !person?.fullName) {
        throw new Error("Could not scrape a person from this page.");
      }
      if (person.linkedinUrl) {
        person.linkedinUrl = this.crm.normalizeLinkedIn(person.linkedinUrl);
      }
      this.lastScraped = person;
      return person;
    }

    /**
     * Compare scraped page data to CRM without writing.
     * @returns {Promise<object>}
     */
    async analyze(person) {
      const scraped = person || (await this.scrape());
      const res = await this.crm.enrich({
        mode: "preview",
        overwriteMismatches: this.overwriteMismatches,
        source: this.source,
        sourceUrl: location.href,
        person: scraped,
      });
      this.lastPlan = res.plan;
      return res;
    }

    /**
     * Apply enrichment updates to CRM.
     * @returns {Promise<object>}
     */
    async apply(person, options = {}) {
      const scraped = person || this.lastScraped || (await this.scrape());
      const res = await this.crm.enrich({
        mode: "apply",
        overwriteMismatches:
          options.overwriteMismatches ?? this.overwriteMismatches,
        source: this.source,
        sourceUrl: location.href,
        person: scraped,
      });
      this.lastPlan = res.plan;
      return res;
    }

    /**
     * Full enrich cycle. Use dryRun:true for automation dry-runs.
     * @param {{ dryRun?: boolean, overwriteMismatches?: boolean }} [options]
     */
    async run(options = {}) {
      const scraped = await this.scrape();
      if (options.dryRun) {
        return this.analyze(scraped);
      }
      // Preview first so callers can log diffs, then apply.
      const preview = await this.analyze(scraped);
      if (!preview.plan?.inCrm) {
        return preview;
      }
      if (!preview.plan.updateCount && !preview.plan.experiencesIncoming) {
        return preview;
      }
      return this.apply(scraped, options);
    }

    /** Human-readable summary for status panel / future job logs. */
    static formatReport(result) {
      const plan = result?.plan;
      if (!plan) return result?.message || "Enrichment finished.";
      if (!plan.inCrm) {
        return "Not in CRM yet — use Capture first, then Enrich.";
      }
      const lines = [
        result.message || "Enrichment result",
        `Missing: ${plan.missingCount} · Mismatch: ${plan.mismatchCount} · Updates: ${plan.updateCount}`,
      ];
      const actionable = (plan.diffs || []).filter((d) => d.willUpdate);
      for (const d of actionable.slice(0, 8)) {
        lines.push(
          `• ${d.field}: ${d.status} — "${d.crmValue || "∅"}" → "${d.scrapedValue}"`,
        );
      }
      if (plan.experiencesIncoming) {
        lines.push(`• experiences: ${plan.experiencesIncoming} role(s) available`);
      }
      return lines.join("\n");
    }
  }

  window.KineticEnrichment = KineticEnrichment;
})();
