import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDbAsync } from "@/lib/db";
import { createNotification } from "@/lib/notifications";
import { getOrganization } from "@/lib/org";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(2000).optional().nullable(),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "opportunities:approve");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const org = await getOrganization(user.organization_id);
  const allowList = org?.settings.opportunityApproval.approverUserIds || [];
  if (allowList.length && !allowList.includes(user.id)) {
    return error("You are not an assigned approver", 403);
  }

  const db = await getDbAsync();
  const opp = (await db
    .prepare(
      `SELECT * FROM opportunities WHERE id = ? AND organization_id = ?`,
    )
    .get(id, user.organization_id)) as
    | { id: string; name: string; owner_user_id: string | null; approval_status: string }
    | undefined;
  if (!opp) return error("Not found", 404);
  if (opp.approval_status !== "pending") {
    return error("Opportunity is not pending approval", 400);
  }

  await db
    .prepare(
      `UPDATE opportunities SET
         approval_status = ?,
         approved_by = ?,
         approved_at = datetime('now'),
         approval_note = ?,
         updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
    )
    .run(
      parsed.data.decision,
      user.id,
      parsed.data.note ?? null,
      id,
      user.organization_id,
    );

  if (opp.owner_user_id && opp.owner_user_id !== user.id) {
    await createNotification({
      organizationId: user.organization_id,
      userId: opp.owner_user_id,
      type: `opportunity.${parsed.data.decision}`,
      title: `Opportunity ${parsed.data.decision}`,
      body: opp.name,
      href: `/opportunities?open=${id}`,
      entityType: "opportunity",
      entityId: id,
    });
  }

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: `opportunity.${parsed.data.decision}`,
    entityType: "opportunity",
    entityId: id,
    after: parsed.data,
  });

  return json({ ok: true, decision: parsed.data.decision });
}
