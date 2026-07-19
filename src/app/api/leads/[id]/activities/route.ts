import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDbAsync } from "@/lib/db";
import { listEntityActivities, recordActivity } from "@/lib/activities";

type Ctx = { params: Promise<{ id: string }> };

async function assertLead(orgId: string, id: string) {
  const db = await getDbAsync();
  return db
    .prepare(`SELECT id FROM leads WHERE id = ? AND organization_id = ?`)
    .get(id, orgId);
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "leads:read");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  if (!(await assertLead(user.organization_id, id))) {
    return error("Lead not found", 404);
  }

  const activities = await listEntityActivities({
    organizationId: user.organization_id,
    entityType: "lead",
    entityId: id,
  });
  return json({ activities });
}

const postSchema = z.object({
  title: z.string().min(1).max(300),
  body: z.string().max(5000).optional().nullable(),
  activityType: z.enum(["note", "call", "meeting", "task"]).default("note"),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "leads:write");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  if (!(await assertLead(user.organization_id, id))) {
    return error("Lead not found", 404);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const { activity } = await recordActivity({
    organizationId: user.organization_id,
    actorUserId: user.id,
    entityType: "lead",
    entityId: id,
    activityType: parsed.data.activityType,
    title: parsed.data.title,
    body: parsed.data.body ?? null,
    metadata: { source: "crm_ui" },
  });

  return json({ activity }, 201);
}
