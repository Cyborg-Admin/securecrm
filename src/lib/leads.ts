import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";
import { normalizeLinkedInUid, splitName } from "@/lib/normalize";
import { upsertCompany } from "@/lib/companies";
import { writeAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { runAutomations } from "@/lib/automation";
import { parseJsonObject } from "@/lib/json";
import {
  replaceLeadExperiences,
  type ExperienceInput,
} from "@/lib/experiences";

export type LeadCaptureInput = {
  organizationId: string;
  actorUserId: string;
  linkedinUrl?: string | null;
  email?: string | null;
  fullName: string;
  jobTitle?: string | null;
  companyName?: string | null;
  industry?: string | null;
  website?: string | null;
  location?: string | null;
  /** @deprecated Not stored — taglines/headlines are ignored. */
  headline?: string | null;
  source: "linkedin" | "salesnav" | "cognism" | "gmail" | "manual";
  sourceUrl?: string | null;
  ownerUserId?: string | null;
  metadata?: Record<string, unknown>;
  batchId?: string | null;
  experiences?: ExperienceInput[];
};

export type LeadRow = {
  id: string;
  organization_id: string;
  linkedin_uid: string | null;
  email: string | null;
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

function normalizeLeadEmail(value: string | null | undefined): string | null {
  const e = String(value || "")
    .trim()
    .toLowerCase();
  return e.includes("@") ? e : null;
}

export async function captureLead(input: LeadCaptureInput): Promise<{
  lead: LeadRow;
  created: boolean;
  companyId: string | null;
}> {
  const db = await getDbAsync();
  const linkedinUid = input.linkedinUrl
    ? normalizeLinkedInUid(input.linkedinUrl)
    : null;
  const email =
    normalizeLeadEmail(input.email) ||
    normalizeLeadEmail(
      typeof input.metadata?.gmail_email === "string"
        ? input.metadata.gmail_email
        : null,
    );

  if (!input.fullName.trim()) {
    throw new Error("VALIDATION:full_name is required");
  }

  const scrapeSources = ["linkedin", "salesnav", "cognism"];
  if (scrapeSources.includes(input.source) && !linkedinUid) {
    throw new Error(
      "VALIDATION:linkedin_uid is required for LinkedIn / Sales Nav / Cognism capture",
    );
  }
  if (!linkedinUid && !email) {
    throw new Error("VALIDATION:linkedin_uid or email is required");
  }

  let companyId: string | null = null;
  if (input.companyName?.trim()) {
    const logoUrl =
      typeof input.metadata?.companyLogoUrl === "string"
        ? input.metadata.companyLogoUrl
        : null;
    const { company } = await upsertCompany({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      name: input.companyName,
      website: input.website,
      industry: input.industry,
      location: input.location,
      ownerUserId: input.ownerUserId ?? input.actorUserId,
      metadata: {
        source: input.source,
        ...(logoUrl ? { logoUrl } : {}),
      },
    });
    companyId = company.id;
  }

  let existing: LeadRow | undefined;
  if (linkedinUid) {
    existing = await db
      .prepare<LeadRow>(
        `SELECT * FROM leads WHERE organization_id = ? AND linkedin_uid = ?`,
      )
      .get(input.organizationId, linkedinUid);
  }
  if (!existing && email) {
    existing = await db
      .prepare<LeadRow>(
        `SELECT * FROM leads WHERE organization_id = ? AND lower(email) = ?`,
      )
      .get(input.organizationId, email);
  }

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
         linkedin_uid = COALESCE(?, linkedin_uid),
         email = COALESCE(?, email),
         full_name = ?,
         first_name = ?,
         last_name = ?,
         job_title = COALESCE(?, job_title),
         company_id = COALESCE(?, company_id),
         company_name = COALESCE(?, company_name),
         industry = COALESCE(?, industry),
         website = COALESCE(?, website),
         location = COALESCE(?, location),
         source = ?,
         source_url = COALESCE(?, source_url),
         metadata_json = ?,
         updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
      )
      .run(
        linkedinUid,
        email,
        input.fullName.trim(),
        names.first_name,
        names.last_name,
        input.jobTitle ?? null,
        companyId,
        input.companyName ?? null,
        input.industry ?? null,
        input.website ?? null,
        input.location ?? null,
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

    if (input.experiences?.length) {
      await replaceLeadExperiences({
        organizationId: input.organizationId,
        leadId: lead.id,
        experiences: input.experiences,
      });
    }

    return { lead, created: false, companyId };
  }

  const id = newId();
  await db
    .prepare(
      `INSERT INTO leads
     (id, organization_id, linkedin_uid, email, full_name, first_name, last_name,
      job_title, company_id, company_name, industry, website, location,
      source, source_url, status, owner_user_id, metadata_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?)`,
    )
    .run(
      id,
      input.organizationId,
      linkedinUid,
      email,
      input.fullName.trim(),
      names.first_name,
      names.last_name,
      input.jobTitle ?? null,
      companyId,
      input.companyName ?? null,
      input.industry ?? null,
      input.website ?? null,
      input.location ?? null,
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

  if (owner && owner !== input.actorUserId) {
    await createNotification({
      organizationId: input.organizationId,
      userId: owner,
      type: "lead.created",
      title: "New lead assigned to you",
      body: `${lead.full_name}${lead.company_name ? ` · ${lead.company_name}` : ""}`,
      href: `/leads?open=${lead.id}`,
      entityType: "lead",
      entityId: lead.id,
      metadata: { source: input.source },
    });
  }

  if (input.experiences?.length) {
    await replaceLeadExperiences({
      organizationId: input.organizationId,
      leadId: lead.id,
      experiences: input.experiences,
    });
  }

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

  if (input.toUserId !== input.actorUserId) {
    const href =
      input.entityType === "lead"
        ? `/leads?open=${input.entityId}`
        : input.entityType === "contact"
          ? `/contacts?open=${input.entityId}`
          : "/companies";
    await createNotification({
      organizationId: input.organizationId,
      userId: input.toUserId,
      type: `${input.entityType}.assigned`,
      title: `${input.entityType[0].toUpperCase()}${input.entityType.slice(1)} assigned to you`,
      body: input.reason || "Ownership was transferred to you.",
      href,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: { fromUserId: current.owner_user_id, byUserId: input.actorUserId },
    });
  }
}
