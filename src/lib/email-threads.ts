import { createHash } from "crypto";
import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";
import { recordActivity } from "@/lib/activities";
import { parseJsonArray, parseJsonObject } from "@/lib/json";

export type EmailParticipant = {
  email: string;
  name?: string | null;
  role?: "from" | "to" | "cc" | "bcc" | "other";
};

export type EmailMessageInput = {
  organizationId: string;
  actorUserId?: string | null;
  provider?: string;
  externalThreadId?: string | null;
  externalMessageId?: string | null;
  subject?: string | null;
  snippet?: string | null;
  bodyText?: string | null;
  direction?: "inbound" | "outbound" | "unknown";
  fromEmail?: string | null;
  fromName?: string | null;
  toEmails?: string[];
  ccEmails?: string[];
  participants?: EmailParticipant[];
  sourceUrl?: string | null;
  sentAt?: string | null;
  /** CRM entities to attach this thread to (tenant-checked by caller). */
  links?: Array<{ entityType: "lead" | "contact" | "company"; entityId: string }>;
  /** Also write a timeline activity on each linked entity */
  logActivity?: boolean;
  activityType?: "email" | "email_scanned";
};

function normalizeEmail(value: string | null | undefined): string | null {
  const e = String(value || "")
    .trim()
    .toLowerCase();
  return e.includes("@") ? e : null;
}

function uniqueEmails(list: Array<string | null | undefined>): string[] {
  return [...new Set(list.map(normalizeEmail).filter(Boolean) as string[])];
}

function threadKey(provider: string, externalThreadId: string | null, fallback: string) {
  if (externalThreadId) return `${provider}:${externalThreadId}`;
  return `${provider}:hash:${createHash("sha256").update(fallback).digest("hex").slice(0, 24)}`;
}

/**
 * Upsert an email thread + message, link to CRM entities, optionally log activities.
 * All queries are organization-scoped.
 */
export async function upsertEmailConversation(input: EmailMessageInput): Promise<{
  threadId: string;
  messageId: string;
  createdMessage: boolean;
}> {
  const db = await getDbAsync();
  const provider = input.provider || "gmail";
  const fromEmail = normalizeEmail(input.fromEmail);
  const toEmails = uniqueEmails(input.toEmails || []);
  const ccEmails = uniqueEmails(input.ccEmails || []);
  const subject = (input.subject || "").trim() || "(no subject)";
  const sentAt = input.sentAt || new Date().toISOString();
  const externalThreadId =
    (input.externalThreadId || "").trim() ||
    null;
  const externalMessageId =
    (input.externalMessageId || "").trim() ||
    createHash("sha256")
      .update(
        [
          provider,
          externalThreadId || "",
          fromEmail || "",
          subject,
          sentAt,
          (input.sourceUrl || "").split("?")[0],
        ].join("|"),
      )
      .digest("hex")
      .slice(0, 40);

  const participants: EmailParticipant[] = [
    ...(input.participants || []),
  ];
  if (fromEmail && !participants.some((p) => normalizeEmail(p.email) === fromEmail)) {
    participants.push({
      email: fromEmail,
      name: input.fromName || null,
      role: "from",
    });
  }
  for (const email of toEmails) {
    if (!participants.some((p) => normalizeEmail(p.email) === email)) {
      participants.push({ email, role: "to" });
    }
  }
  for (const email of ccEmails) {
    if (!participants.some((p) => normalizeEmail(p.email) === email)) {
      participants.push({ email, role: "cc" });
    }
  }

  const fallbackKey = [
    fromEmail || "",
    subject.toLowerCase(),
    (input.sourceUrl || "").split("#")[0].split("?")[0],
  ].join("|");
  const logicalThread = threadKey(provider, externalThreadId, fallbackKey);

  let thread = await db
    .prepare<{ id: string }>(
      `SELECT id FROM email_threads
       WHERE organization_id = ? AND provider = ? AND external_thread_id = ?
       LIMIT 1`,
    )
    .get(input.organizationId, provider, logicalThread);

  let threadId = thread?.id;
  if (!threadId) {
    threadId = newId();
    await db
      .prepare(
        `INSERT INTO email_threads
         (id, organization_id, provider, external_thread_id, subject, snippet,
          participants_json, last_message_at, source_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        threadId,
        input.organizationId,
        provider,
        logicalThread,
        subject,
        (input.snippet || "").slice(0, 500) || null,
        JSON.stringify(participants),
        sentAt,
        input.sourceUrl ?? null,
      );
  } else {
    await db
      .prepare(
        `UPDATE email_threads SET
           subject = COALESCE(?, subject),
           snippet = COALESCE(?, snippet),
           participants_json = ?,
           last_message_at = CASE
             WHEN last_message_at IS NULL OR last_message_at < ? THEN ?
             ELSE last_message_at
           END,
           source_url = COALESCE(?, source_url),
           updated_at = datetime('now')
         WHERE id = ? AND organization_id = ?`,
      )
      .run(
        subject,
        (input.snippet || "").slice(0, 500) || null,
        JSON.stringify(participants),
        sentAt,
        sentAt,
        input.sourceUrl ?? null,
        threadId,
        input.organizationId,
      );
  }

  const existingMsg = await db
    .prepare<{ id: string }>(
      `SELECT id FROM email_messages
       WHERE organization_id = ? AND provider = ? AND external_message_id = ?
       LIMIT 1`,
    )
    .get(input.organizationId, provider, externalMessageId);

  let messageId = existingMsg?.id;
  let createdMessage = false;
  if (!messageId) {
    messageId = newId();
    await db
      .prepare(
        `INSERT INTO email_messages
         (id, organization_id, thread_id, provider, external_message_id, direction,
          from_email, from_name, to_emails_json, cc_emails_json, subject, snippet,
          body_text, source_url, sent_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        messageId,
        input.organizationId,
        threadId,
        provider,
        externalMessageId,
        input.direction || "unknown",
        fromEmail,
        input.fromName ?? null,
        JSON.stringify(toEmails),
        JSON.stringify(ccEmails),
        subject,
        (input.snippet || "").slice(0, 800) || null,
        (input.bodyText || "").slice(0, 8000) || null,
        input.sourceUrl ?? null,
        sentAt,
        JSON.stringify({
          participants,
        }),
      );
    createdMessage = true;
  }

  for (const link of input.links || []) {
    const exists = await db
      .prepare(
        `SELECT 1 FROM email_thread_links
         WHERE organization_id = ? AND thread_id = ?
           AND entity_type = ? AND entity_id = ?`,
      )
      .get(
        input.organizationId,
        threadId,
        link.entityType,
        link.entityId,
      );
    if (!exists) {
      await db
        .prepare(
          `INSERT INTO email_thread_links
           (id, organization_id, thread_id, entity_type, entity_id)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          newId(),
          input.organizationId,
          threadId,
          link.entityType,
          link.entityId,
        );
    }

    if (input.logActivity !== false) {
      const fromLine =
        input.fromName && fromEmail
          ? `${input.fromName} <${fromEmail}>`
          : fromEmail || input.fromName || "Unknown sender";
      const involved = participants
        .map((p) => (p.name ? `${p.name} <${p.email}>` : p.email))
        .slice(0, 8)
        .join(", ");

      await recordActivity({
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        entityType: link.entityType,
        entityId: link.entityId,
        activityType: input.activityType || "email",
        title: subject,
        body: [
          `From: ${fromLine}`,
          involved ? `Involved: ${involved}` : null,
          input.snippet ? input.snippet.slice(0, 600) : null,
        ]
          .filter(Boolean)
          .join("\n"),
        dedupeKey: `email_msg:${link.entityType}:${link.entityId}:${externalMessageId}`.slice(
          0,
          390,
        ),
        occurredAt: sentAt,
        metadata: {
          source: provider,
          threadId,
          messageId,
          subject,
          fromEmail,
          fromName: input.fromName || null,
          toEmails,
          ccEmails,
          participants,
          sourceUrl: input.sourceUrl || null,
          direction: input.direction || "unknown",
          sentAt,
        },
      });
    }
  }

  return { threadId: threadId!, messageId: messageId!, createdMessage };
}

export async function listEntityEmailThreads(input: {
  organizationId: string;
  entityType: "lead" | "contact" | "company";
  entityId: string;
  limit?: number;
}) {
  const db = await getDbAsync();
  const limit = Math.min(input.limit || 20, 50);
  const threads = await db
    .prepare(
      `SELECT t.*
       FROM email_threads t
       INNER JOIN email_thread_links l
         ON l.thread_id = t.id AND l.organization_id = t.organization_id
       WHERE t.organization_id = ?
         AND l.entity_type = ?
         AND l.entity_id = ?
       ORDER BY t.last_message_at DESC
       LIMIT ?`,
    )
    .all(
      input.organizationId,
      input.entityType,
      input.entityId,
      limit,
    );

  const out = [];
  for (const t of threads as Array<Record<string, unknown>>) {
    const messages = await db
      .prepare(
        `SELECT * FROM email_messages
         WHERE organization_id = ? AND thread_id = ?
         ORDER BY sent_at ASC
         LIMIT 50`,
      )
      .all(input.organizationId, t.id);
    out.push({
      id: t.id,
      subject: t.subject,
      snippet: t.snippet,
      sourceUrl: t.source_url,
      lastMessageAt: t.last_message_at,
      participants: parseJsonArray<EmailParticipant>(t.participants_json),
      messages: (messages as Array<Record<string, unknown>>).map((m) => ({
        id: m.id,
        subject: m.subject,
        fromEmail: m.from_email,
        fromName: m.from_name,
        toEmails: parseJsonArray<string>(m.to_emails_json),
        ccEmails: parseJsonArray<string>(m.cc_emails_json),
        snippet: m.snippet,
        bodyText: m.body_text,
        sourceUrl: m.source_url,
        sentAt: m.sent_at,
        direction: m.direction,
        metadata: parseJsonObject(m.metadata_json),
      })),
    });
  }
  return out;
}
