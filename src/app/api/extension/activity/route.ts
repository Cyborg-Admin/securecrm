import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDbAsync } from "@/lib/db";
import { recordActivity } from "@/lib/activities";

const schema = z.object({
  entityType: z.enum(["lead", "contact", "company"]),
  entityId: z.string().uuid(),
  activityType: z.string().min(1).max(80).default("email_scanned"),
  title: z.string().min(1).max(300),
  body: z.string().max(5000).optional().nullable(),
  dedupeKey: z.string().max(400).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  alsoLeadId: z.string().uuid().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await requireUser(req, "extension:match");
  if (isResponse(user)) return user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const db = await getDbAsync();
  const table =
    parsed.data.entityType === "lead"
      ? "leads"
      : parsed.data.entityType === "contact"
        ? "contacts"
        : "companies";
  const exists = await db
    .prepare(`SELECT id FROM ${table} WHERE id = ? AND organization_id = ?`)
    .get(parsed.data.entityId, user.organization_id);
  if (!exists) return error("Entity not found", 404);

  const primary = await recordActivity({
    organizationId: user.organization_id,
    actorUserId: user.id,
    entityType: parsed.data.entityType,
    entityId: parsed.data.entityId,
    activityType: parsed.data.activityType,
    title: parsed.data.title,
    body: parsed.data.body ?? null,
    dedupeKey: parsed.data.dedupeKey ?? null,
    metadata: {
      source: "extension",
      ...(parsed.data.metadata || {}),
    },
  });

  let mirrorCreated = false;
  if (parsed.data.alsoLeadId) {
    const lead = await db
      .prepare(`SELECT id FROM leads WHERE id = ? AND organization_id = ?`)
      .get(parsed.data.alsoLeadId, user.organization_id);
    if (lead) {
      const mirrorKey = parsed.data.dedupeKey
        ? `${parsed.data.dedupeKey}:lead:${parsed.data.alsoLeadId}`
        : null;
      const mirror = await recordActivity({
        organizationId: user.organization_id,
        actorUserId: user.id,
        entityType: "lead",
        entityId: parsed.data.alsoLeadId,
        activityType: parsed.data.activityType,
        title: parsed.data.title,
        body: parsed.data.body ?? null,
        dedupeKey: mirrorKey,
        metadata: {
          source: "extension",
          mirroredFrom: parsed.data.entityType,
          mirroredEntityId: parsed.data.entityId,
          ...(parsed.data.metadata || {}),
        },
      });
      mirrorCreated = mirror.created;
    }
  }

  return json({
    created: primary.created,
    activity: primary.activity,
    mirroredToLead: mirrorCreated,
  });
}
