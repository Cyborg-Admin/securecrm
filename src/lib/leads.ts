import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";
import { normalizeLinkedInUid, splitName } from "@/lib/normalize";
import { upsertCompany } from "@/lib/companies";
import { writeAudit } from "@/lib/audit";
import { runAutomations } from "@/lib/automation";
import { parseJsonObject } from "@/lib/json";

export type LeadCaptureInput = {
  organizationId: string;
  actorUserId: string;
  linkedinUrl: string;
  fullName: string;
  jobTitle?: string | null;
  companyName?: string | null;
  industry?: string | null;
  website?: string | null;
  location?: string | null;
  headline?: string | null;
  source: "linkedin" | "salesnav" | "cognism" | "gmail" | "manual";
  sourceUrl?: string | null;
  ownerUserId?: string | null;
  metadata?: Record<string, unknown>;
  batchId?: string | null;
};

export type LeadRow = {
  id: string;
  organization_id: string;
  linkedin_uid: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  company_id: string | null;
  company_name: string | null;
  industry: string | null;
  website: string | null;
  location: string | null;
  headline: string | null;
  source: string;
  source_url: string | null;
  status: string;
  owner_user_id: string | null;
  metadata_json: string;
};

export async function captureLead(input: LeadCaptureInput): Promise<{
  lead: LeadRow;
  created: boolean;
  companyId: string | null;
}> {
  const db = await getDbAsync();
  const linkedinUid = normalizeLinkedInUid(input.linkedinUrl);
  if (!linkedinUid || !input.fullName.trim()) {
    throw new Error("VALIDATION:linkedin_uid and full_name are required");
  }

  let companyId: string | null = null;
  if (input.companyName?.trim()) {
    const { company } = await upsertCompany({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      name: input.companyName,
      website: input.website,
      industry: input.industry,
      location: input.location,
      ownerUserId: input.ownerUserId ?? input.actorUserId,
      metadata: { source: input.source },
    });
    companyId = company.id;
  }

  const existing = await db
    .prepare<LeadRow>(
      `SELECT * FROM leads WHERE organization_id = ? AND linkedin_uid = ?`,
    )
    .get(input.organizationId, linkedinUid);

  const names = splitName(input.fullName);
  const owner = input.ownerUserId ?? input.actorUserId;

  if (existing) {
    const before = { ...existing };
    const nextMeta = {
      ...parseJsonObject(existing.metadata_json),
      ...(input.metadata || {}),
      last_source: input.source,
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
         source = ?,
         source_url = COALESCE(?, source_url),
         metadata_json = ?,
         updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
      )
      .run(
        input.fullName.trim(),
        names.first_name,
        names.last_name,
        input.jobTitle ?? null,
        companyId,
        input.companyName ?? null,
        input.industry ?? null,
        input.website ?? null,
        input.location ?? null,
        input.headline ?? null,
        input.source,
        input.sourceUrl ?? null,
        JSON.stringify(nextMeta),
        existing.id,
        input.organizationId,
      );

    const lead = (await db
      .prepare<LeadRow>("SELECT * FROM leads WHERE id = ?")
      .get(existing.id))!;

    await writeAudit({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "lead.updated",
      entityType: "lead",
      entityId: lead.id,
      before,
      after: lead,
    });

    return { lead, created: false, companyId };
  }

  const id = newId();
  await db
    .prepare(
      `INSERT INTO leads
     (id, organization_id, linkedin_uid, full_name, first_name, last_name,
      job_title, company_id, company_name, industry, website, location, headline,
      source, source_url, status, owner_user_id, metadata_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)`,
    )
    .run(
      id,
      input.organizationId,
      linkedinUid,
      input.fullName.trim(),
      names.first_name,
      names.last_name,
      input.jobTitle ?? null,
      companyId,
      input.companyName ?? null,
      input.industry ?? null,
      input.website ?? null,
      input.location ?? null,
      input.headline ?? null,
      input.source,
      input.sourceUrl ?? null,
      owner,
      JSON.stringify({ ...(input.metadata || {}), batch_id: input.batchId || null }),
      input.actorUserId,
    );

  const lead = (await db
    .prepare<LeadRow>("SELECT * FROM leads WHERE id = ?")
    .get(id))!;

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "lead.created",
    entityType: "lead",
    entityId: id,
    after: lead,
  });

  await runAutomations({
    organizationId: input.organizationId,
    triggerType: "lead.captured",
    actorUserId: input.actorUserId,
    context: { lead, source: input.source },
  });

  return { lead, created: true, companyId };
}

export async function assignOwner(input: {
  organizationId: string;
  actorUserId: string;
  entityType: "lead" | "contact" | "company";
  entityId: string;
  toUserId: string;
  reason?: string;
}): Promise<void> {
  const db = await getDbAsync();
  const table =
    input.entityType === "lead"
      ? "leads"
      : input.entityType === "contact"
        ? "contacts"
        : "companies";

  const current = await db
    .prepare<{ owner_user_id: string | null; organization_id: string }>(
      `SELECT owner_user_id, organization_id FROM ${table} WHERE id = ?`,
    )
    .get(input.entityId);

  if (!current || current.organization_id !== input.organizationId) {
    throw new Error("NOT_FOUND");
  }

  await db
    .prepare(
      `UPDATE ${table} SET owner_user_id = ?, updated_at = datetime('now')
     WHERE id = ? AND organization_id = ?`,
    )
    .run(input.toUserId, input.entityId, input.organizationId);

  await db
    .prepare(
      `INSERT INTO ownership_transfers
     (id, organization_id, entity_type, entity_id, from_user_id, to_user_id, changed_by, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId(),
      input.organizationId,
      input.entityType,
      input.entityId,
      current.owner_user_id,
      input.toUserId,
      input.actorUserId,
      input.reason ?? null,
    );

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: `${input.entityType}.assigned`,
    entityType: input.entityType,
    entityId: input.entityId,
    before: { owner_user_id: current.owner_user_id },
    after: { owner_user_id: input.toUserId },
  });
}
