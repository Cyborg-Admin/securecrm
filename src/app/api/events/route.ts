import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";
import { assertFeatureEnabled } from "@/lib/org";
import { ensureDefaultStages } from "@/lib/pipelines";

export async function GET(req: NextRequest) {
  const user = await requireUser(req, "events:read");
  if (isResponse(user)) return user;
  if (!(await assertFeatureEnabled(user.organization_id, "events"))) {
    return error("Events feature is disabled", 403);
  }

  const db = await getDbAsync();
  const events = await db
    .prepare(
      `SELECT e.*, u.full_name as owner_name,
              (SELECT COUNT(*) FROM event_registrations er
               WHERE er.event_id = e.id AND er.organization_id = e.organization_id) as registration_count
       FROM events e
       LEFT JOIN users u ON u.id = e.owner_user_id
       WHERE e.organization_id = ?
       ORDER BY COALESCE(e.starts_at, e.created_at) DESC
       LIMIT 100`,
    )
    .all(user.organization_id);
  return json({ events });
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  startsAt: z.string().max(40).optional().nullable(),
  endsAt: z.string().max(40).optional().nullable(),
  status: z
    .enum(["draft", "published", "live", "completed", "cancelled"])
    .default("draft"),
  capacity: z.number().int().min(0).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await requireUser(req, "events:write");
  if (isResponse(user)) return user;
  if (!(await assertFeatureEnabled(user.organization_id, "events"))) {
    return error("Events feature is disabled", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  await ensureDefaultStages(user.organization_id);
  const db = await getDbAsync();
  const id = newId();
  await db
    .prepare(
      `INSERT INTO events
       (id, organization_id, name, description, location, starts_at, ends_at, status, capacity, owner_user_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      user.organization_id,
      parsed.data.name,
      parsed.data.description ?? null,
      parsed.data.location ?? null,
      parsed.data.startsAt ?? null,
      parsed.data.endsAt ?? null,
      parsed.data.status,
      parsed.data.capacity ?? null,
      user.id,
      user.id,
    );

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "event.created",
    entityType: "event",
    entityId: id,
    after: parsed.data,
  });

  const event = await db.prepare(`SELECT * FROM events WHERE id = ?`).get(id);
  return json({ event }, 201);
}
