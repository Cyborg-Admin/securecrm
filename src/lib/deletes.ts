import { getDbAsync } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

export class DeleteBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeleteBlockedError";
  }
}

async function count(
  sql: string,
  ...params: unknown[]
): Promise<number> {
  const db = await getDbAsync();
  const row = (await db.prepare<{ n: number | string }>(sql).get(...params)) as
    | { n: number | string }
    | undefined;
  return Number(row?.n || 0);
}

async function deleteActivities(
  organizationId: string,
  entityType: string,
  entityId: string,
) {
  const db = await getDbAsync();
  await db
    .prepare(
      `DELETE FROM entity_activities
       WHERE organization_id = ? AND entity_type = ? AND entity_id = ?`,
    )
    .run(organizationId, entityType, entityId);
  try {
    await db
      .prepare(
        `DELETE FROM email_thread_links
         WHERE organization_id = ? AND entity_type = ? AND entity_id = ?`,
      )
      .run(organizationId, entityType, entityId);
  } catch {
    /* table may not exist on very old DBs mid-migration */
  }
}

/** Delete a lead only when not converted and no contact is linked. */
export async function deleteLead(input: {
  organizationId: string;
  actorUserId: string;
  leadId: string;
}): Promise<void> {
  const db = await getDbAsync();
  const lead = (await db
    .prepare(
      `SELECT id, status, full_name FROM leads
       WHERE id = ? AND organization_id = ?`,
    )
    .get(input.leadId, input.organizationId)) as
    | { id: string; status: string; full_name: string }
    | undefined;
  if (!lead) throw new Error("NOT_FOUND");

  if (lead.status === "converted") {
    throw new DeleteBlockedError(
      "This lead was converted to a contact — delete or unlink the contact first.",
    );
  }

  const contactCount = await count(
    `SELECT COUNT(*) as n FROM contacts
     WHERE organization_id = ? AND lead_id = ?`,
    input.organizationId,
    input.leadId,
  );
  if (contactCount > 0) {
    throw new DeleteBlockedError(
      `This lead is linked to ${contactCount} contact(s). Remove that link or delete the contact first.`,
    );
  }

  const regCount = await count(
    `SELECT COUNT(*) as n FROM event_registrations
     WHERE organization_id = ? AND registrant_type = 'lead' AND registrant_id = ?`,
    input.organizationId,
    input.leadId,
  );
  if (regCount > 0) {
    throw new DeleteBlockedError(
      `This lead has ${regCount} event registration(s). Remove them first.`,
    );
  }

  await deleteActivities(input.organizationId, "lead", input.leadId);
  // lead_experiences cascade via FK
  const res = await db
    .prepare(`DELETE FROM leads WHERE id = ? AND organization_id = ?`)
    .run(input.leadId, input.organizationId);
  if (!res.changes) throw new Error("NOT_FOUND");

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "lead.deleted",
    entityType: "lead",
    entityId: input.leadId,
    before: lead,
  });
}

/** Delete a contact only when no opportunities or event registrations remain. */
export async function deleteContact(input: {
  organizationId: string;
  actorUserId: string;
  contactId: string;
}): Promise<void> {
  const db = await getDbAsync();
  const contact = (await db
    .prepare(
      `SELECT id, full_name FROM contacts
       WHERE id = ? AND organization_id = ?`,
    )
    .get(input.contactId, input.organizationId)) as
    | { id: string; full_name: string }
    | undefined;
  if (!contact) throw new Error("NOT_FOUND");

  const oppCount = await count(
    `SELECT COUNT(*) as n FROM opportunities
     WHERE organization_id = ? AND contact_id = ?`,
    input.organizationId,
    input.contactId,
  );
  if (oppCount > 0) {
    throw new DeleteBlockedError(
      `This contact is on ${oppCount} opportunit${oppCount === 1 ? "y" : "ies"}. Reassign or close those deals first.`,
    );
  }

  const regCount = await count(
    `SELECT COUNT(*) as n FROM event_registrations
     WHERE organization_id = ? AND registrant_type = 'contact' AND registrant_id = ?`,
    input.organizationId,
    input.contactId,
  );
  if (regCount > 0) {
    throw new DeleteBlockedError(
      `This contact has ${regCount} event registration(s). Remove them first.`,
    );
  }

  await deleteActivities(input.organizationId, "contact", input.contactId);
  const res = await db
    .prepare(`DELETE FROM contacts WHERE id = ? AND organization_id = ?`)
    .run(input.contactId, input.organizationId);
  if (!res.changes) throw new Error("NOT_FOUND");

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "contact.deleted",
    entityType: "contact",
    entityId: input.contactId,
    before: contact,
  });
}

/** Delete a company (account) only when no leads, contacts, or opportunities remain. */
export async function deleteCompany(input: {
  organizationId: string;
  actorUserId: string;
  companyId: string;
}): Promise<void> {
  const db = await getDbAsync();
  const company = (await db
    .prepare(
      `SELECT id, name FROM companies
       WHERE id = ? AND organization_id = ?`,
    )
    .get(input.companyId, input.organizationId)) as
    | { id: string; name: string }
    | undefined;
  if (!company) throw new Error("NOT_FOUND");

  const leads = await count(
    `SELECT COUNT(*) as n FROM leads WHERE organization_id = ? AND company_id = ?`,
    input.organizationId,
    input.companyId,
  );
  const contacts = await count(
    `SELECT COUNT(*) as n FROM contacts WHERE organization_id = ? AND company_id = ?`,
    input.organizationId,
    input.companyId,
  );
  const opps = await count(
    `SELECT COUNT(*) as n FROM opportunities WHERE organization_id = ? AND company_id = ?`,
    input.organizationId,
    input.companyId,
  );

  if (leads || contacts || opps) {
    const parts = [
      leads ? `${leads} lead(s)` : null,
      contacts ? `${contacts} contact(s)` : null,
      opps ? `${opps} opportunit${opps === 1 ? "y" : "ies"}` : null,
    ].filter(Boolean);
    throw new DeleteBlockedError(
      `This account still has ${parts.join(", ")}. Reassign or delete those records first.`,
    );
  }

  await deleteActivities(input.organizationId, "company", input.companyId);
  const res = await db
    .prepare(`DELETE FROM companies WHERE id = ? AND organization_id = ?`)
    .run(input.companyId, input.organizationId);
  if (!res.changes) throw new Error("NOT_FOUND");

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "company.deleted",
    entityType: "company",
    entityId: input.companyId,
    before: company,
  });
}

/** Delete an opportunity when not pending approval. Line items cascade. */
export async function deleteOpportunity(input: {
  organizationId: string;
  actorUserId: string;
  opportunityId: string;
}): Promise<void> {
  const db = await getDbAsync();
  const opp = (await db
    .prepare(
      `SELECT id, name, approval_status FROM opportunities
       WHERE id = ? AND organization_id = ?`,
    )
    .get(input.opportunityId, input.organizationId)) as
    | { id: string; name: string; approval_status: string | null }
    | undefined;
  if (!opp) throw new Error("NOT_FOUND");

  if (opp.approval_status === "pending") {
    throw new DeleteBlockedError(
      "This opportunity is pending approval — approve or reject it before deleting.",
    );
  }

  const regCount = await count(
    `SELECT COUNT(*) as n FROM event_registrations
     WHERE organization_id = ? AND opportunity_id = ?`,
    input.organizationId,
    input.opportunityId,
  );
  if (regCount > 0) {
    throw new DeleteBlockedError(
      `This opportunity is linked to ${regCount} event registration(s). Unlink them first.`,
    );
  }

  await deleteActivities(input.organizationId, "opportunity", input.opportunityId);
  const res = await db
    .prepare(`DELETE FROM opportunities WHERE id = ? AND organization_id = ?`)
    .run(input.opportunityId, input.organizationId);
  if (!res.changes) throw new Error("NOT_FOUND");

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "opportunity.deleted",
    entityType: "opportunity",
    entityId: input.opportunityId,
    before: opp,
  });
}

/** Delete an event only when it has no registrations (cancel instead if live). */
export async function deleteEvent(input: {
  organizationId: string;
  actorUserId: string;
  eventId: string;
}): Promise<void> {
  const db = await getDbAsync();
  const event = (await db
    .prepare(
      `SELECT id, name, status FROM events
       WHERE id = ? AND organization_id = ?`,
    )
    .get(input.eventId, input.organizationId)) as
    | { id: string; name: string; status: string }
    | undefined;
  if (!event) throw new Error("NOT_FOUND");

  const regCount = await count(
    `SELECT COUNT(*) as n FROM event_registrations
     WHERE organization_id = ? AND event_id = ?`,
    input.organizationId,
    input.eventId,
  );
  if (regCount > 0) {
    throw new DeleteBlockedError(
      `This event has ${regCount} registration(s). Remove registrations or set status to cancelled instead of deleting.`,
    );
  }

  await deleteActivities(input.organizationId, "event", input.eventId);
  const res = await db
    .prepare(`DELETE FROM events WHERE id = ? AND organization_id = ?`)
    .run(input.eventId, input.organizationId);
  if (!res.changes) throw new Error("NOT_FOUND");

  await writeAudit({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: "event.deleted",
    entityType: "event",
    entityId: input.eventId,
    before: event,
  });
}
