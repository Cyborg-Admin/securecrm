import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  triggerType: z.string().min(1).max(100),
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  actions: z.array(z.record(z.string(), z.unknown())).min(1),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const user = await requireUser(req, "automations:read");
  if (isResponse(user)) return user;
  const db = getDb();
  const automations = db
    .prepare(
      `SELECT a.*,
        (SELECT COUNT(*) FROM automation_runs r WHERE r.automation_id = a.id) as run_count
       FROM automations a
       WHERE a.organization_id = ?
       ORDER BY a.updated_at DESC`,
    )
    .all(user.organization_id);
  return json({ automations });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req, "automations:write");
  if (isResponse(user)) return user;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const id = newId();
  const db = getDb();
  db.prepare(
    `INSERT INTO automations
     (id, organization_id, name, description, trigger_type, trigger_config, actions_json, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    user.organization_id,
    parsed.data.name,
    parsed.data.description ?? null,
    parsed.data.triggerType,
    JSON.stringify(parsed.data.triggerConfig || {}),
    JSON.stringify(parsed.data.actions),
    parsed.data.isActive === false ? 0 : 1,
    user.id,
  );

  writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "automation.created",
    entityType: "automation",
    entityId: id,
    after: parsed.data,
  });

  return json({ id }, 201);
}
