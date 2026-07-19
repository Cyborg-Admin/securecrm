import { getDb } from "@/lib/db";
import { newId } from "@/lib/ids";
import { normalizeCompanyName, normalizeDomain } from "@/lib/normalize";
import { writeAudit } from "@/lib/audit";

export type CompanyRow = {
  id: string;
  organization_id: string;
  name: string;
  name_normalized: string;
  domain: string | null;
  domain_normalized: string | null;
  industry: string | null;
  website: string | null;
  linkedin_url: string | null;
  employee_count: string | null;
  location: string | null;
  owner_user_id: string | null;
  metadata_json: string;
};

export function findCompanyDuplicate(input: {
  organizationId: string;
  name?: string | null;
  website?: string | null;
  domain?: string | null;
}): CompanyRow | null {
  const db = getDb();
  const domain = normalizeDomain(input.domain || input.website);
  if (domain) {
    const byDomain = db
      .prepare<CompanyRow>(
        `SELECT * FROM companies
         WHERE organization_id = ? AND domain_normalized = ?
         LIMIT 1`,
      )
      .get(input.organizationId, domain);
    if (byDomain) return byDomain;
  }
  if (input.name) {
    const normalized = normalizeCompanyName(input.name);
    if (normalized) {
      return (
        db
          .prepare<CompanyRow>(
            `SELECT * FROM companies
             WHERE organization_id = ? AND name_normalized = ?
             LIMIT 1`,
          )
          .get(input.organizationId, normalized) || null
      );
    }
  }
  return null;
}

export function upsertCompany(input: {
  organizationId: string;
  actorUserId: string;
  name: string;
  website?: string | null;
  industry?: string | null;
  linkedinUrl?: string | null;
  employeeCount?: string | null;
  location?: string | null;
  ownerUserId?: string | null;
  metadata?: Record<string, unknown>;
}): { company: CompanyRow; created: boolean } {
  const db = getDb();
  const existing = findCompanyDuplicate({
    organizationId: input.organizationId,
    name: input.name,
    website: input.website,
  });

  if (existing) {
    const nextMeta = {
      ...JSON.parse(existing.metadata_json || "{}"),
      ...(input.metadata || {}),
    };
    db.prepare(
      `UPDATE companies SET
         industry = COALESCE(?, industry),
         website = COALESCE(?, website),
         domain = COALESCE(?, domain),
         domain_normalized = COALESCE(?, domain_normalized),
         linkedin_url = COALESCE(?, linkedin_url),
         employee_count = COALESCE(?, employee_count),
         location = COALESCE(?, location),
         metadata_json = ?,
         updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
    ).run(
      input.industry ?? null,
      input.website ?? null,
      normalizeDomain(input.website),
      normalizeDomain(input.website),
      input.linkedinUrl ?? null,
      input.employeeCount ?? null,
      input.location ?? null,
      JSON.stringify(nextMeta),
      existing.id,
      input.organizationId,
    );
    const company = db
      .prepare<CompanyRow>("SELECT * FROM companies WHERE id = ?")
      .get(existing.id)!;
    return { company, created: false };
  }

  const id = newId();
  const domain = normalizeDomain(input.website);
  db.prepare(
    `INSERT INTO companies
     (id, organization_id, name, name_normalized, domain, domain_normalized,
      industry, website, linkedin_url, employee_count, location, owner_user_id,
      metadata_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.organizationId,
    input.name.trim(),
    normalizeCompanyName(input.name),
    domain,
    domain,
    input.industry ?? null,
    input.website ?? null,
    input.linkedinUrl ?? null,
    input.employeeCount ?? null,
    input.location ?? null,
    input.ownerUserId ?? input.actorUserId,
    JSON.stringify(input.metadata || {}),
    input.actorUserId,
  );

  const company = db
    .prepare<CompanyRow>("SELECT * FROM companies WHERE id = ?")
    .get(id)!;

  writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "company.created",
    entityType: "company",
    entityId: id,
    after: company,
  });

  return { company, created: true };
}
