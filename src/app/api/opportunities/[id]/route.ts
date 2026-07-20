import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDbAsync } from "@/lib/db";
import { DeleteBlockedError, deleteOpportunity } from "@/lib/deletes";
import { createNotification } from "@/lib/notifications";
import { assertFeatureEnabled, getOrganization } from "@/lib/org";

type Ctx = { params: Promise<{ id: string }> };

async function loadOpportunityWithRelations(id: string, organizationId: string) {
  const db = await getDbAsync();
  return db
    .prepare(
      `SELECT o.*, c.name as company_name, ct.full_name as contact_name,
              s.name as stage_name, u.full_name as owner_name
       FROM opportunities o
       LEFT JOIN companies c
         ON c.id = o.company_id AND c.organization_id = o.organization_id
       LEFT JOIN contacts ct
         ON ct.id = o.contact_id AND ct.organization_id = o.organization_id
       LEFT JOIN pipeline_stages s
         ON s.id = o.stage_id AND s.organization_id = o.organization_id
       LEFT JOIN users u
         ON u.id = o.owner_user_id AND u.organization_id = o.organization_id
       WHERE o.id = ? AND o.organization_id = ?`,
    )
    .get(id, organizationId);
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "opportunities:read");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const opportunity = await loadOpportunityWithRelations(
    id,
    user.organization_id,
  );
  if (!opportunity) return error("Not found", 404);
  return json({ opportunity });
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  companyId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  stageId: z.string().uuid().optional().nullable(),
  amount: z.number().optional().nullable(),
  currency: z.string().max(8).optional(),
  closeDate: z.string().max(40).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  ownerUserId: z.string().uuid().optional().nullable(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "opportunities:write");
  if (isResponse(user)) return user;
  if (!(await assertFeatureEnabled(user.organization_id, "opportunities"))) {
    return error("Opportunities feature is disabled", 403);
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
  const existing = (await db
    .prepare(`SELECT * FROM opportunities WHERE id = ? AND organization_id = ?`)
    .get(id, user.organization_id)) as Record<string, unknown> | undefined;
  if (!existing) return error("Not found", 404);

  const org = await getOrganization(user.organization_id);
  let approvalStatus = String(existing.approval_status || "none");
  const nextStageId =
    parsed.data.stageId !== undefined
      ? parsed.data.stageId
      : (existing.stage_id as string | null);

  if (
    parsed.data.stageId &&
    parsed.data.stageId !== existing.stage_id &&
    org?.settings.opportunityApproval.enabled
  ) {
    const stage = await db
      .prepare<{ requires_approval: number | boolean }>(
        `SELECT requires_approval FROM pipeline_stages
         WHERE id = ? AND organization_id = ? AND pipeline_key = 'opportunity'`,
      )
      .get(parsed.data.stageId, user.organization_id);
    if (!stage) return error("Invalid stage", 400);

    const needs =
      Boolean(stage.requires_approval) ||
      org.settings.opportunityApproval.requireApprovalStageIds.includes(
        parsed.data.stageId,
      );

    if (needs && existing.approval_status !== "approved") {
      approvalStatus = "pending";
      const approvers =
        org.settings.opportunityApproval.approverUserIds.length
          ? org.settings.opportunityApproval.approverUserIds
          : (
              await db
                .prepare<{ id: string }>(
                  `SELECT u.id FROM users u
                   JOIN user_roles ur ON ur.user_id = u.id
                   JOIN roles r ON r.id = ur.role_id
                   WHERE u.organization_id = ? AND r.name = 'Admin'`,
                )
                .all(user.organization_id)
            ).map((r) => r.id);
      for (const approverId of approvers) {
        if (approverId === user.id) continue;
        await createNotification({
          organizationId: user.organization_id,
          userId: approverId,
          type: "opportunity.approval_pending",
          title: "Opportunity stage needs approval",
          body: String(existing.name),
          href: `/opportunities?open=${id}`,
          entityType: "opportunity",
          entityId: id,
        });
      }
    }
  }

  const d = parsed.data;
  await db
    .prepare(
      `UPDATE opportunities SET
         name = COALESCE(?, name),
         company_id = COALESCE(?, company_id),
         contact_id = COALESCE(?, contact_id),
         stage_id = COALESCE(?, stage_id),
         amount = COALESCE(?, amount),
         currency = COALESCE(?, currency),
         close_date = COALESCE(?, close_date),
         description = COALESCE(?, description),
         owner_user_id = COALESCE(?, owner_user_id),
         approval_status = ?,
         updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
    )
    .run(
      d.name ?? null,
      d.companyId === undefined ? null : d.companyId,
      d.contactId === undefined ? null : d.contactId,
      nextStageId,
      d.amount === undefined ? null : d.amount,
      d.currency ?? null,
      d.closeDate === undefined ? null : d.closeDate,
      d.description === undefined ? null : d.description,
      d.ownerUserId === undefined ? null : d.ownerUserId,
      approvalStatus,
      id,
      user.organization_id,
    );

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "opportunity.updated",
    entityType: "opportunity",
    entityId: id,
    before: existing,
    after: { ...d, approvalStatus },
  });

  const opportunity = await loadOpportunityWithRelations(
    id,
    user.organization_id,
  );
  return json({ opportunity });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "opportunities:delete");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  try {
    await deleteOpportunity({
      organizationId: user.organization_id,
      actorUserId: user.id,
      opportunityId: id,
    });
    return json({ ok: true });
  } catch (e) {
    if (e instanceof DeleteBlockedError) return error(e.message, 400);
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return error("Opportunity not found", 404);
    }
    throw e;
  }
}
