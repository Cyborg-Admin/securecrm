import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";
import { assertFeatureEnabled } from "@/lib/org";

type Ctx = { params: Promise<{ id: string }> };

const createSchema = z.object({
  track: z.enum(["sales", "delegate"]),
  registrantType: z.enum(["contact", "lead", "opportunity"]),
  registrantId: z.string().uuid(),
  stageId: z.string().uuid().optional().nullable(),
  opportunityId: z.string().uuid().optional().nullable(),
  status: z
    .enum(["registered", "confirmed", "attended", "cancelled", "no_show"])
    .default("registered"),
  notes: z.string().max(2000).optional().nullable(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "events:write");
  if (isResponse(user)) return user;
  if (!(await assertFeatureEnabled(user.organization_id, "events"))) {
    return error("Events feature is disabled", 403);
  }
  const { id: eventId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const db = await getDbAsync();
  const event = await db
    .prepare(`SELECT id FROM events WHERE id = ? AND organization_id = ?`)
    .get(eventId, user.organization_id);
  if (!event) return error("Event not found", 404);

  const table =
    parsed.data.registrantType === "contact"
      ? "contacts"
      : parsed.data.registrantType === "lead"
        ? "leads"
        : "opportunities";
  const reg = await db
    .prepare(`SELECT id FROM ${table} WHERE id = ? AND organization_id = ?`)
    .get(parsed.data.registrantId, user.organization_id);
  if (!reg) return error("Registrant not found in this organization", 404);

  const pipelineKey =
    parsed.data.track === "sales" ? "event_sales" : "event_delegate";
  let stageId = parsed.data.stageId ?? null;
  if (!stageId) {
    const first = await db
      .prepare<{ id: string }>(
        `SELECT id FROM pipeline_stages
         WHERE organization_id = ? AND pipeline_key = ?
         ORDER BY sort_order ASC LIMIT 1`,
      )
      .get(user.organization_id, pipelineKey);
    stageId = first?.id ?? null;
  }

  const id = newId();
  await db
    .prepare(
      `INSERT INTO event_registrations
       (id, organization_id, event_id, track, registrant_type, registrant_id,
        stage_id, opportunity_id, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      user.organization_id,
      eventId,
      parsed.data.track,
      parsed.data.registrantType,
      parsed.data.registrantId,
      stageId,
      parsed.data.opportunityId ??
        (parsed.data.registrantType === "opportunity"
          ? parsed.data.registrantId
          : null),
      parsed.data.status,
      parsed.data.notes ?? null,
      user.id,
    );

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "event.registration_created",
    entityType: "event_registration",
    entityId: id,
    after: { eventId, ...parsed.data },
  });

  const registration = await db
    .prepare(`SELECT * FROM event_registrations WHERE id = ?`)
    .get(id);
  return json({ registration }, 201);
}
