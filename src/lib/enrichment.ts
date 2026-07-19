import { getDbAsync } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { upsertCompany } from "@/lib/companies";
import {
  replaceLeadExperiences,
  type ExperienceInput,
} from "@/lib/experiences";
import { parseJsonObject } from "@/lib/json";
import { normalizeLinkedInUid, splitName } from "@/lib/normalize";

export type EnrichFieldKey =
  | "fullName"
  | "jobTitle"
  | "companyName"
  | "industry"
  | "website"
  | "location"
  | "headline";

export type ScrapedPerson = {
  linkedinUrl: string;
  fullName?: string | null;
  jobTitle?: string | null;
  companyName?: string | null;
  industry?: string | null;
  website?: string | null;
  location?: string | null;
  headline?: string | null;
  experiences?: ExperienceInput[];
  metadata?: Record<string, unknown>;
};

export type FieldDiff = {
  field: EnrichFieldKey;
  status: "missing" | "mismatch" | "match" | "empty_source";
  crmValue: string | null;
  scrapedValue: string | null;
  willUpdate: boolean;
};

export type EnrichmentPlan = {
  entityType: "lead" | "contact" | null;
  entityId: string | null;
  linkedinUid: string;
  inCrm: boolean;
  diffs: FieldDiff[];
  missingCount: number;
  mismatchCount: number;
  updateCount: number;
  experiencesIncoming: number;
};

const FIELD_MAP: Array<{
  key: EnrichFieldKey;
  crm: string;
  scraped: keyof ScrapedPerson;
}> = [
  { key: "fullName", crm: "full_name", scraped: "fullName" },
  { key: "jobTitle", crm: "job_title", scraped: "jobTitle" },
  { key: "companyName", crm: "company_name", scraped: "companyName" },
  { key: "industry", crm: "industry", scraped: "industry" },
  { key: "website", crm: "website", scraped: "website" },
  { key: "location", crm: "location", scraped: "location" },
  { key: "headline", crm: "headline", scraped: "headline" },
];

function norm(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).replace(/\s+/g, " ").trim();
  return s ? s : null;
}

function same(a: string | null, b: string | null): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Lead/contact enrichment engine.
 * Designed for interactive extension use now and scheduled automation later.
 */
export class LeadEnrichmentEngine {
  constructor(
    private readonly organizationId: string,
    private readonly actorUserId: string,
  ) {}

  async resolveEntity(linkedinUrl: string): Promise<{
    entityType: "lead" | "contact" | null;
    entity: Record<string, unknown> | null;
    linkedinUid: string;
  }> {
    const linkedinUid = normalizeLinkedInUid(linkedinUrl);
    if (!linkedinUid) {
      return { entityType: null, entity: null, linkedinUid: "" };
    }
    const db = await getDbAsync();

    const contact = await db
      .prepare(
        `SELECT id, full_name, job_title, email, linkedin_uid, company_id, metadata_json
         FROM contacts
         WHERE organization_id = ? AND linkedin_uid = ?
         LIMIT 1`,
      )
      .get(this.organizationId, linkedinUid);
    if (contact) {
      const row = { ...(contact as Record<string, unknown>) };
      row.company_name = null;
      row.industry = null;
      row.website = null;
      row.location = null;
      row.headline = null;
      const companyId = row.company_id as string | null;
      if (companyId) {
        const company = await db
          .prepare<{
            name: string;
            industry: string | null;
            website: string | null;
            location: string | null;
          }>(
            `SELECT name, industry, website, location FROM companies
             WHERE id = ? AND organization_id = ?`,
          )
          .get(companyId, this.organizationId);
        if (company) {
          row.company_name = company.name;
          row.industry = company.industry;
          row.website = company.website;
          row.location = company.location;
        }
      }
      return {
        entityType: "contact",
        entity: row,
        linkedinUid,
      };
    }

    const lead = await db
      .prepare(
        `SELECT * FROM leads
         WHERE organization_id = ? AND linkedin_uid = ?
         LIMIT 1`,
      )
      .get(this.organizationId, linkedinUid);

    return {
      entityType: lead ? "lead" : null,
      entity: (lead as Record<string, unknown>) || null,
      linkedinUid,
    };
  }

  buildPlan(
    entity: Record<string, unknown> | null,
    scraped: ScrapedPerson,
    options: { overwriteMismatches: boolean },
  ): Omit<EnrichmentPlan, "entityType" | "entityId" | "linkedinUid" | "inCrm"> {
    const diffs: FieldDiff[] = [];

    for (const map of FIELD_MAP) {
      // Contacts don't have company_name/headline columns natively — use hydrated values.
      if (
        entity &&
        map.crm === "headline" &&
        !("headline" in entity) &&
        entity.email !== undefined
      ) {
        // contact row: skip headline unless present
      }

      const crmValue = entity ? norm(entity[map.crm]) : null;
      const scrapedValue = norm(scraped[map.scraped]);

      let status: FieldDiff["status"];
      let willUpdate = false;

      if (!scrapedValue) {
        status = "empty_source";
      } else if (!crmValue) {
        status = "missing";
        willUpdate = true;
      } else if (same(crmValue, scrapedValue)) {
        status = "match";
      } else {
        status = "mismatch";
        willUpdate = options.overwriteMismatches;
      }

      diffs.push({
        field: map.key,
        status,
        crmValue,
        scrapedValue,
        willUpdate,
      });
    }

    return {
      diffs,
      missingCount: diffs.filter((d) => d.status === "missing").length,
      mismatchCount: diffs.filter((d) => d.status === "mismatch").length,
      updateCount: diffs.filter((d) => d.willUpdate).length,
      experiencesIncoming: scraped.experiences?.length || 0,
    };
  }

  async analyze(
    scraped: ScrapedPerson,
    options: { overwriteMismatches?: boolean } = {},
  ): Promise<EnrichmentPlan> {
    const overwriteMismatches = options.overwriteMismatches !== false;
    const resolved = await this.resolveEntity(scraped.linkedinUrl);
    const plan = this.buildPlan(resolved.entity, scraped, { overwriteMismatches });

    return {
      entityType: resolved.entityType,
      entityId: resolved.entity
        ? String(resolved.entity.id)
        : null,
      linkedinUid: resolved.linkedinUid,
      inCrm: Boolean(resolved.entity),
      ...plan,
    };
  }

  async apply(
    scraped: ScrapedPerson,
    options: { overwriteMismatches?: boolean; source?: string; sourceUrl?: string | null } = {},
  ): Promise<{
    plan: EnrichmentPlan;
    updated: boolean;
    created: boolean;
    entityType: "lead" | "contact" | null;
    entityId: string | null;
  }> {
    const overwriteMismatches = options.overwriteMismatches !== false;
    const plan = await this.analyze(scraped, { overwriteMismatches });
    if (!plan.inCrm || !plan.entityId || !plan.entityType) {
      return {
        plan,
        updated: false,
        created: false,
        entityType: null,
        entityId: null,
      };
    }

    if (plan.updateCount === 0 && !plan.experiencesIncoming) {
      return {
        plan,
        updated: false,
        created: false,
        entityType: plan.entityType,
        entityId: plan.entityId,
      };
    }

    if (plan.entityType === "lead") {
      await this.applyToLead(plan.entityId, scraped, plan, options);
    } else {
      await this.applyToContact(plan.entityId, scraped, plan);
    }

    return {
      plan,
      updated: true,
      created: false,
      entityType: plan.entityType,
      entityId: plan.entityId,
    };
  }

  private async applyToLead(
    leadId: string,
    scraped: ScrapedPerson,
    plan: EnrichmentPlan,
    options: { source?: string; sourceUrl?: string | null },
  ): Promise<void> {
    const db = await getDbAsync();
    const existing = (await db
      .prepare(`SELECT * FROM leads WHERE id = ? AND organization_id = ?`)
      .get(leadId, this.organizationId)) as Record<string, unknown> | undefined;
    if (!existing) return;

    const patch: Record<string, string | null> = {};
    for (const diff of plan.diffs) {
      if (!diff.willUpdate || !diff.scrapedValue) continue;
      const map = FIELD_MAP.find((f) => f.key === diff.field)!;
      patch[map.crm] = diff.scrapedValue;
    }

    let companyId = (existing.company_id as string | null) || null;
    if (patch.company_name || scraped.companyName) {
      const companyName = patch.company_name || scraped.companyName;
      if (companyName) {
        const { company } = await upsertCompany({
          organizationId: this.organizationId,
          actorUserId: this.actorUserId,
          name: companyName,
          website: patch.website ?? scraped.website,
          industry: patch.industry ?? scraped.industry,
          location: patch.location ?? scraped.location,
          ownerUserId: (existing.owner_user_id as string) || this.actorUserId,
          metadata: { source: "enrichment" },
        });
        companyId = company.id;
      }
    }

    const fullName = patch.full_name || String(existing.full_name);
    const names = splitName(fullName);
    const nextMeta = {
      ...parseJsonObject(existing.metadata_json),
      ...(scraped.metadata || {}),
      last_enriched_at: new Date().toISOString(),
      enrichment_source: options.source || "extension",
    };

    await db
      .prepare(
        `UPDATE leads SET
           full_name = ?,
           first_name = ?,
           last_name = ?,
           job_title = COALESCE(?, job_title),
           company_id = COALESCE(?, company_id),
           company_name = COALESCE(?, company_name),
           industry = COALESCE(?, industry),
           website = COALESCE(?, website),
           location = COALESCE(?, location),
           headline = COALESCE(?, headline),
           source_url = COALESCE(?, source_url),
           metadata_json = ?,
           updated_at = datetime('now')
         WHERE id = ? AND organization_id = ?`,
      )
      .run(
        fullName,
        names.first_name,
        names.last_name,
        patch.job_title ?? null,
        companyId,
        patch.company_name ?? null,
        patch.industry ?? null,
        patch.website ?? null,
        patch.location ?? null,
        patch.headline ?? null,
        options.sourceUrl ?? null,
        JSON.stringify(nextMeta),
        leadId,
        this.organizationId,
      );

    // Overwrite mismatches that COALESCE would skip when CRM already had a value
    const sets: string[] = [];
    const vals: unknown[] = [];
    for (const [col, val] of Object.entries(patch)) {
      if (col === "full_name") continue;
      if (val == null) continue;
      const diff = plan.diffs.find(
        (d) => FIELD_MAP.find((f) => f.key === d.field)?.crm === col,
      );
      if (diff?.status === "mismatch" && diff.willUpdate) {
        sets.push(`${col} = ?`);
        vals.push(val);
      }
    }
    if (sets.length) {
      vals.push(leadId, this.organizationId);
      await db
        .prepare(
          `UPDATE leads SET ${sets.join(", ")}, updated_at = datetime('now')
           WHERE id = ? AND organization_id = ?`,
        )
        .run(...vals);
    }

    if (scraped.experiences?.length) {
      await replaceLeadExperiences({
        organizationId: this.organizationId,
        leadId,
        experiences: scraped.experiences,
      });
    }

    const after = await db
      .prepare(`SELECT * FROM leads WHERE id = ?`)
      .get(leadId);
    await writeAudit({
      organizationId: this.organizationId,
      actorUserId: this.actorUserId,
      action: "lead.enriched",
      entityType: "lead",
      entityId: leadId,
      before: existing,
      after,
    });
  }

  private async applyToContact(
    contactId: string,
    scraped: ScrapedPerson,
    plan: EnrichmentPlan,
  ): Promise<void> {
    const db = await getDbAsync();
    const existing = (await db
      .prepare(`SELECT * FROM contacts WHERE id = ? AND organization_id = ?`)
      .get(contactId, this.organizationId)) as Record<string, unknown> | undefined;
    if (!existing) return;

    const fullNameDiff = plan.diffs.find((d) => d.field === "fullName");
    const titleDiff = plan.diffs.find((d) => d.field === "jobTitle");
    const companyDiff = plan.diffs.find((d) => d.field === "companyName");

    let companyId = (existing.company_id as string | null) || null;
    if (companyDiff?.willUpdate && companyDiff.scrapedValue) {
      const { company } = await upsertCompany({
        organizationId: this.organizationId,
        actorUserId: this.actorUserId,
        name: companyDiff.scrapedValue,
        website: scraped.website,
        industry: scraped.industry,
        location: scraped.location,
        ownerUserId: (existing.owner_user_id as string) || this.actorUserId,
        metadata: { source: "enrichment" },
      });
      companyId = company.id;
    }

    await db
      .prepare(
        `UPDATE contacts SET
           full_name = COALESCE(?, full_name),
           job_title = COALESCE(?, job_title),
           company_id = COALESCE(?, company_id),
           updated_at = datetime('now')
         WHERE id = ? AND organization_id = ?`,
      )
      .run(
        fullNameDiff?.willUpdate ? fullNameDiff.scrapedValue : null,
        titleDiff?.willUpdate ? titleDiff.scrapedValue : null,
        companyId,
        contactId,
        this.organizationId,
      );

    // Force mismatch overwrites
    if (fullNameDiff?.status === "mismatch" && fullNameDiff.willUpdate) {
      await db
        .prepare(
          `UPDATE contacts SET full_name = ?, updated_at = datetime('now')
           WHERE id = ? AND organization_id = ?`,
        )
        .run(fullNameDiff.scrapedValue, contactId, this.organizationId);
    }
    if (titleDiff?.status === "mismatch" && titleDiff.willUpdate) {
      await db
        .prepare(
          `UPDATE contacts SET job_title = ?, updated_at = datetime('now')
           WHERE id = ? AND organization_id = ?`,
        )
        .run(titleDiff.scrapedValue, contactId, this.organizationId);
    }

    const after = await db
      .prepare(`SELECT * FROM contacts WHERE id = ?`)
      .get(contactId);
    await writeAudit({
      organizationId: this.organizationId,
      actorUserId: this.actorUserId,
      action: "contact.enriched",
      entityType: "contact",
      entityId: contactId,
      before: existing,
      after,
    });
  }
}
