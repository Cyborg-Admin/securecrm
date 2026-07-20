import { getDbAsync } from "@/lib/db";
import { upsertEmailConversation } from "@/lib/email-threads";
import type { MatchCandidate } from "@/lib/match";

export type EmailScanContext = {
  subject?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  toEmails?: string[];
  ccEmails?: string[];
  sourceUrl?: string | null;
  snippet?: string | null;
  bodyText?: string | null;
  externalThreadId?: string | null;
  externalMessageId?: string | null;
  sentAt?: string | null;
  direction?: "inbound" | "outbound" | "unknown";
  provider?: string;
};

/** Persist a Gmail open/scan as a conversation + timeline activity on the matched entity. */
export async function logEmailScanForMatch(input: {
  organizationId: string;
  actorUserId: string;
  match: MatchCandidate;
  email: EmailScanContext;
}): Promise<{ created: boolean; leadCreated: boolean }> {
  const links: Array<{
    entityType: "lead" | "contact" | "company";
    entityId: string;
  }> = [
    {
      entityType: input.match.entity_type,
      entityId: input.match.id,
    },
  ];

  let leadCreated = false;
  if (input.match.entity_type === "contact") {
    const db = await getDbAsync();
    const contact = await db
      .prepare<{ lead_id: string | null }>(
        `SELECT lead_id FROM contacts WHERE id = ? AND organization_id = ?`,
      )
      .get(input.match.id, input.organizationId);
    if (contact?.lead_id) {
      links.push({ entityType: "lead", entityId: contact.lead_id });
    }
  }

  const result = await upsertEmailConversation({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    provider: input.email.provider || "gmail",
    externalThreadId: input.email.externalThreadId,
    externalMessageId: input.email.externalMessageId,
    subject: input.email.subject,
    snippet: input.email.snippet,
    bodyText: input.email.bodyText || input.email.snippet,
    direction: input.email.direction || "inbound",
    fromEmail: input.email.fromEmail,
    fromName: input.email.fromName,
    toEmails: input.email.toEmails || [],
    ccEmails: input.email.ccEmails || [],
    sourceUrl: input.email.sourceUrl,
    sentAt: input.email.sentAt,
    links,
    logActivity: true,
    activityType: "email_scanned",
  });

  if (input.match.entity_type === "lead") {
    leadCreated = result.createdMessage;
  } else if (links.some((l) => l.entityType === "lead")) {
    leadCreated = result.createdMessage;
  }

  return { created: result.createdMessage, leadCreated };
}
