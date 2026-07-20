import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDbAsync } from "@/lib/db";
import { listEntityActivities, recordActivity } from "@/lib/activities";
import { listEntityEmailThreads, upsertEmailConversation } from "@/lib/email-threads";

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
  const emailThreads = await listEntityEmailThreads({
    organizationId: user.organization_id,
    entityType: "lead",
    entityId: id,
  });
  return json({ activities, emailThreads });
}

const postSchema = z.object({
  title: z.string().min(1).max(300),
  body: z.string().max(5000).optional().nullable(),
  activityType: z
    .enum(["note", "call", "meeting", "task", "email", "linkedin", "other"])
    .default("note"),
  // Optional email conversation fields when activityType === "email"
  fromEmail: z.string().email().max(320).optional().nullable(),
  fromName: z.string().max(200).optional().nullable(),
  toEmails: z.array(z.string().email().max(320)).max(20).optional(),
  ccEmails: z.array(z.string().email().max(320)).max(20).optional(),
  sourceUrl: z.string().max(2000).optional().nullable(),
  sentAt: z.string().max(80).optional().nullable(),
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

  const d = parsed.data;

  if (d.activityType === "email") {
    const { messageId } = await upsertEmailConversation({
      organizationId: user.organization_id,
      actorUserId: user.id,
      provider: "manual",
      subject: d.title,
      snippet: d.body,
      bodyText: d.body,
      fromEmail: d.fromEmail,
      fromName: d.fromName,
      toEmails: d.toEmails || [],
      ccEmails: d.ccEmails || [],
      sourceUrl: d.sourceUrl,
      sentAt: d.sentAt,
      direction: "outbound",
      links: [{ entityType: "lead", entityId: id }],
      logActivity: true,
      activityType: "email",
    });

    const activities = await listEntityActivities({
      organizationId: user.organization_id,
      entityType: "lead",
      entityId: id,
      limit: 1,
    });
    const activity =
      activities.find((a) => {
        const meta = a.metadata as { messageId?: string } | undefined;
        return meta?.messageId === messageId;
      }) || activities[0];

    return json({ activity }, 201);
  }

  const { activity } = await recordActivity({
    organizationId: user.organization_id,
    actorUserId: user.id,
    entityType: "lead",
    entityId: id,
    activityType: d.activityType,
    title: d.title,
    body: d.body ?? null,
    metadata: { source: "crm_ui" },
  });

  return json({ activity }, 201);
}
