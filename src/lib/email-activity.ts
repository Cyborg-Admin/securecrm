import { createHash } from "crypto";
import { getDbAsync } from "@/lib/db";
import { recordActivity } from "@/lib/activities";
import type { MatchCandidate } from "@/lib/match";

export type EmailScanContext = {
  subject?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  sourceUrl?: string | null;
  snippet?: string | null;
};

function dedupeKey(
  entityType: string,
  entityId: string,
  ctx: EmailScanContext,
): string {
  const raw = [
    entityType,
    entityId,
    (ctx.fromEmail || "").toLowerCase(),
    (ctx.subject || "").trim().toLowerCase(),
    (ctx.sourceUrl || "").split("?")[0],
  ].join("|");
  return `gmail:${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;
}

/** Persist a Gmail open/scan as CRM activity on the matched entity (and parent lead). */
export async function logEmailScanForMatch(input: {
  organizationId: string;
  actorUserId: string;
  match: MatchCandidate;
  email: EmailScanContext;
}): Promise<{ created: boolean; leadCreated: boolean }> {
  const subject = (input.email.subject || "").trim() || "(no subject)";
  const title = `Email opened: ${subject}`;
  const fromLine =
    input.email.fromName && input.email.fromEmail
      ? `From: ${input.email.fromName} <${input.email.fromEmail}>`
      : input.email.fromEmail
        ? `From: ${input.email.fromEmail}`
        : input.email.fromName
          ? `From: ${input.email.fromName}`
          : null;
  const bodyParts = [
    fromLine,
    input.email.snippet ? input.email.snippet.slice(0, 800) : null,
  ].filter(Boolean);

  const meta = {
    source: "gmail",
    subject: input.email.subject || null,
    fromEmail: input.email.fromEmail || null,
    fromName: input.email.fromName || null,
    sourceUrl: input.email.sourceUrl || null,
    matchScore: input.match.score,
  };

  const primary = await recordActivity({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    entityType: input.match.entity_type,
    entityId: input.match.id,
    activityType: "email_scanned",
    title,
    body: bodyParts.join("\n\n") || null,
    dedupeKey: dedupeKey(input.match.entity_type, input.match.id, input.email),
    metadata: meta,
  });

  let leadCreated = false;
  if (input.match.entity_type === "contact") {
    const db = await getDbAsync();
    const contact = await db
      .prepare<{ lead_id: string | null }>(
        `SELECT lead_id FROM contacts WHERE id = ? AND organization_id = ?`,
      )
      .get(input.match.id, input.organizationId);
    if (contact?.lead_id) {
      const mirror = await recordActivity({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        entityType: "lead",
        entityId: contact.lead_id,
        activityType: "email_scanned",
        title,
        body: bodyParts.join("\n\n") || null,
        dedupeKey: dedupeKey("lead", contact.lead_id, input.email),
        metadata: {
          ...meta,
          mirroredFrom: "contact",
          contactId: input.match.id,
        },
      });
      leadCreated = mirror.created;
    }
  } else {
    leadCreated = primary.created;
  }

  return { created: primary.created, leadCreated };
}
