import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";
import { createNotification } from "@/lib/notifications";
import { assertFeatureEnabled, getOrganization } from "@/lib/org";
import { ensureDefaultStages } from "@/lib/pipelines";

export async function GET(req: NextRequest) {
  const user = await requireUser(req, "opportunities:read");
  if (isResponse(user)) return user;
  if (!(await assertFeatureEnabled(user.organization_id, "opportunities"))) {
    return error("Opportunities feature is disabled", 403);
  }

  const db = await getDbAsync();
  const q = req.nextUrl.searchParams.get("q")?.trim();
  let sql = `SELECT o.*,
              c.name as company_name,
              ct.full_name as contact_name,
              s.name as stage_name,
              u.full_name as owner_name
       FROM opportunities o
       LEFT JOIN companies c ON c.id = o.company_id
       LEFT JOIN contacts ct ON ct.id = o.contact_id
       LEFT JOIN pipeline_stages s ON s.id = o.stage_id
       LEFT JOIN users u ON u.id = o.owner_user_id
       WHERE o.organization_id = ?`;
  const params: unknown[] = [user.organization_id];
  if (q) {
    sql += ` AND (o.name LIKE ? OR c.name LIKE ? OR ct.full_name LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ` ORDER BY o.updated_at DESC LIMIT 100`;
  const opportunities = await db.prepare(sql).all(...params);
  return json({ opportunities });
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  companyId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  stageId: z.string().uuid().optional().nullable(),
  amount: z.number().optional().nullable(),
  currency: z.string().max(8).optional(),
  closeDate: z.string().max(40).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  ownerUserId: z.string().uuid().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await requireUser(req, "opportunities:write");
  if (isResponse(user)) return user;
  if (!(await assertFeatureEnabled(user.organization_id, "opportunities"))) {
    return error("Opportunities feature is disabled", 403);
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
  const org = await getOrganization(user.organization_id);

  let stageId = parsed.data.stageId ?? null;
  if (!stageId) {
    const first = await db
      .prepare<{ id: string }>(
        `SELECT id FROM pipeline_stages
         WHERE organization_id = ? AND pipeline_key = 'opportunity'
         ORDER BY sort_order ASC LIMIT 1`,
      )
      .get(user.organization_id);
    stageId = first?.id ?? null;
  }

  let approvalStatus = "none";
  if (stageId) {
    const stage = await db
      .prepare<{ requires_approval: number | boolean; name: string }>(
        `SELECT requires_approval, name FROM pipeline_stages
         WHERE id = ? AND organization_id = ?`,
      )
      .get(stageId, user.organization_id);
    const needs =
      org?.settings.opportunityApproval.enabled &&
      (Boolean(stage?.requires_approval) ||
        org.settings.opportunityApproval.requireApprovalStageIds.includes(stageId));
    if (needs) approvalStatus = "pending";
  }

  const id = newId();
  await db
    .prepare(
      `INSERT INTO opportunities
       (id, organization_id, name, company_id, contact_id, stage_id, amount, currency,
        close_date, owner_user_id, approval_status, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      user.organization_id,
      parsed.data.name,
      parsed.data.companyId ?? null,
      parsed.data.contactId ?? null,
      stageId,
      parsed.data.amount ?? null,
      parsed.data.currency || org?.settings.currency || "GBP",
      parsed.data.closeDate ?? null,
      parsed.data.ownerUserId ?? user.id,
      approvalStatus,
      parsed.data.description ?? null,
      user.id,
    );

  if (approvalStatus === "pending") {
    const approvers =
      org?.settings.opportunityApproval.approverUserIds?.length
        ? org.settings.opportunityApproval.approverUserIds
        : (
            await db
              .prepare<{ id: string }>(
                `SELECT u.id FROM users u
                 JOIN user_roles ur ON ur.user_id = u.id
                 JOIN roles r ON r.id = ur.role_id
                 WHERE u.organization_id = ? AND r.name = 'Admin' AND u.is_active = ${
                   db.driver === "postgres" ? "TRUE" : "1"
                 }`,
              )
              .all(user.organization_id)
          ).map((r) => r.id);

    for (const approverId of approvers) {
      if (approverId === user.id) continue;
      await createNotification({
        organizationId: user.organization_id,
        userId: approverId,
        type: "opportunity.approval_pending",
        title: "Opportunity needs approval",
        body: parsed.data.name,
        href: `/opportunities?open=${id}`,
        entityType: "opportunity",
        entityId: id,
      });
    }
  }

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "opportunity.created",
    entityType: "opportunity",
    entityId: id,
    after: { ...parsed.data, approvalStatus },
  });

  const opportunity = await db
    .prepare(`SELECT * FROM opportunities WHERE id = ?`)
    .get(id);
  return json({ opportunity }, 201);
}
