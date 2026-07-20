import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";
import { normalizeLinkedInUid } from "@/lib/normalize";
import { writeAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { runAutomations } from "@/lib/automation";

export type ContactRow = {
  id: string;
  organization_id: string;
  lead_id: string | null;
  company_id: string | null;
  linkedin_uid: string | null;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  owner_user_id: string | null;
  metadata_json: string;
};

export async function createContact(input: {
  organizationId: string;
  actorUserId: string;
  fullName: string;
  linkedinUrl?: string | null;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  companyId?: string | null;
  leadId?: string | null;
  ownerUserId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ContactRow> {
  const db = await getDbAsync();
  const linkedinUid = input.linkedinUrl
    ? normalizeLinkedInUid(input.linkedinUrl)
    : null;

  if (linkedinUid) {
    const existing = await db
      .prepare<ContactRow>(
        `SELECT * FROM contacts
         WHERE organization_id = ? AND linkedin_uid = ?`,
      )
      .get(input.organizationId, linkedinUid);
    if (existing) {
      throw new Error("DUPLICATE:contact_linkedin");
    }
  }

  const id = newId();
  await db
    .prepare(
      `INSERT INTO contacts
     (id, organization_id, lead_id, company_id, linkedin_uid, full_name,
      job_title, email, phone, owner_user_id, metadata_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.organizationId,
      input.leadId ?? null,
      input.companyId ?? null,
      linkedinUid,
      input.fullName.trim(),
      input.jobTitle ?? null,
      input.email?.trim().toLowerCase() || null,
      input.phone ?? null,
      input.ownerUserId ?? input.actorUserId,
      JSON.stringify(input.metadata || {}),
      input.actorUserId,
    );

  const contact = (await db
    .prepare<ContactRow>("SELECT * FROM contacts WHERE id = ?")
    .get(id))!;

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "contact.created",
    entityType: "contact",
    entityId: id,
    after: contact,
  });

  return contact;
}

/** Progress a lead into a contact (contact stage). */
export async function convertLeadToContact(input: {
  organizationId: string;
  actorUserId: string;
  leadId: string;
  email?: string | null;
  phone?: string | null;
}): Promise<{ contact: ContactRow; created: boolean }> {
  const db = await getDbAsync();
  const lead = await db
    .prepare<{
      id: string;
      organization_id: string;
      linkedin_uid: string | null;
      email: string | null;
      full_name: string;
      job_title: string | null;
      company_id: string | null;
      owner_user_id: string | null;
      status: string;
    }>(
      `SELECT id, organization_id, linkedin_uid, email, full_name, job_title,
              company_id, owner_user_id, status
       FROM leads WHERE id = ? AND organization_id = ?`,
    )
    .get(input.leadId, input.organizationId);

  if (!lead) throw new Error("NOT_FOUND:lead");

  let existing = await db
    .prepare<ContactRow>(
      `SELECT * FROM contacts
       WHERE organization_id = ? AND lead_id = ?`,
    )
    .get(input.organizationId, lead.id);

  if (!existing && lead.linkedin_uid) {
    existing = await db
      .prepare<ContactRow>(
        `SELECT * FROM contacts
         WHERE organization_id = ? AND linkedin_uid = ?`,
      )
      .get(input.organizationId, lead.linkedin_uid);
  }
  if (!existing && (input.email || lead.email)) {
    const email = String(input.email || lead.email)
      .trim()
      .toLowerCase();
    existing = await db
      .prepare<ContactRow>(
        `SELECT * FROM contacts
         WHERE organization_id = ? AND lower(email) = ?`,
      )
      .get(input.organizationId, email);
  }

  const contactEmail = input.email ?? lead.email ?? null;

  if (existing) {
    await db
      .prepare(
        `UPDATE contacts SET
         lead_id = COALESCE(lead_id, ?),
         email = COALESCE(?, email),
         phone = COALESCE(?, phone),
         updated_at = datetime('now')
       WHERE id = ?`,
      )
      .run(lead.id, contactEmail, input.phone ?? null, existing.id);

    await db
      .prepare(
        `UPDATE leads SET status = 'converted', updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
      )
      .run(lead.id, input.organizationId);

    const contact = (await db
      .prepare<ContactRow>("SELECT * FROM contacts WHERE id = ?")
      .get(existing.id))!;
    return { contact, created: false };
  }

  const linkedinUrl = lead.linkedin_uid
    ? lead.linkedin_uid.startsWith("http")
      ? lead.linkedin_uid
      : `https://www.${lead.linkedin_uid.replace(/^www\./, "")}`
    : null;

  const contact = await createContact({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    fullName: lead.full_name,
    linkedinUrl,
    jobTitle: lead.job_title,
    email: contactEmail,
    phone: input.phone,
    companyId: lead.company_id,
    leadId: lead.id,
    ownerUserId: lead.owner_user_id,
    metadata: { progressed_from_lead: true },
  });

  await db
    .prepare(
      `UPDATE leads SET status = 'converted', updated_at = datetime('now')
     WHERE id = ? AND organization_id = ?`,
    )
    .run(lead.id, input.organizationId);

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "lead.converted",
    entityType: "lead",
    entityId: lead.id,
    after: { contact_id: contact.id },
  });

  if (lead.owner_user_id && lead.owner_user_id !== input.actorUserId) {
    await createNotification({
      organizationId: input.organizationId,
      userId: lead.owner_user_id,
      type: "lead.converted",
      title: "Lead progressed to contact",
      body: lead.full_name,
      href: `/contacts?open=${contact.id}`,
      entityType: "contact",
      entityId: contact.id,
      metadata: { leadId: lead.id },
    });
  }

  await runAutomations({
    organizationId: input.organizationId,
    triggerType: "lead.converted",
    actorUserId: input.actorUserId,
    context: { lead, contact },
  });

  return { contact, created: true };
}
