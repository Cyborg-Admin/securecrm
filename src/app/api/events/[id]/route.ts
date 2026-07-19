import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDbAsync } from "@/lib/db";
import { assertFeatureEnabled } from "@/lib/org";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "events:read");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const db = await getDbAsync();
  const event = await db
    .prepare(
      `SELECT e.*, u.full_name as owner_name
       FROM events e
       LEFT JOIN users u ON u.id = e.owner_user_id
       WHERE e.id = ? AND e.organization_id = ?`,
    )
    .get(id, user.organization_id);
  if (!event) return error("Not found", 404);

  const registrations = await db
    .prepare(
      `SELECT er.*, s.name as stage_name
       FROM event_registrations er
       LEFT JOIN pipeline_stages s ON s.id = er.stage_id
       WHERE er.event_id = ? AND er.organization_id = ?
       ORDER BY er.created_at DESC`,
    )
    .all(id, user.organization_id);

  return json({ event, registrations });
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  startsAt: z.string().max(40).optional().nullable(),
  endsAt: z.string().max(40).optional().nullable(),
  status: z
    .enum(["draft", "published", "live", "completed", "cancelled"])
    .optional(),
  capacity: z.number().int().min(0).optional().nullable(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "events:write");
  if (isResponse(user)) return user;
  if (!(await assertFeatureEnabled(user.organization_id, "events"))) {
    return error("Events feature is disabled", 403);
  }
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const db = await getDbAsync();
  const existing = await db
    .prepare(`SELECT * FROM events WHERE id = ? AND organization_id = ?`)
    .get(id, user.organization_id);
  if (!existing) return error("Not found", 404);

  const d = parsed.data;
  await db
    .prepare(
      `UPDATE events SET
         name = COALESCE(?, name),
         description = COALESCE(?, description),
         location = COALESCE(?, location),
         starts_at = COALESCE(?, starts_at),
         ends_at = COALESCE(?, ends_at),
         status = COALESCE(?, status),
         capacity = COALESCE(?, capacity),
         updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
    )
    .run(
      d.name ?? null,
      d.description === undefined ? null : d.description,
      d.location === undefined ? null : d.location,
      d.startsAt === undefined ? null : d.startsAt,
      d.endsAt === undefined ? null : d.endsAt,
      d.status ?? null,
      d.capacity === undefined ? null : d.capacity,
      id,
      user.organization_id,
    );

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "event.updated",
    entityType: "event",
    entityId: id,
    after: d,
  });

  const event = await db.prepare(`SELECT * FROM events WHERE id = ?`).get(id);
  return json({ event });
}
