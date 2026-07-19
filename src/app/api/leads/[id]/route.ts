import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { assignOwner } from "@/lib/leads";

const patchSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  jobTitle: z.string().max(200).optional().nullable(),
  companyName: z.string().max(200).optional().nullable(),
  industry: z.string().max(200).optional().nullable(),
  website: z.string().max(300).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  headline: z.string().max(500).optional().nullable(),
  status: z.string().max(50).optional(),
  ownerUserId: z.string().uuid().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "leads:read");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const db = getDb();
  const lead = db
    .prepare(
      `SELECT l.*, u.full_name as owner_name, c.name as company_display
       FROM leads l
       LEFT JOIN users u ON u.id = l.owner_user_id
       LEFT JOIN companies c ON c.id = l.company_id
       WHERE l.id = ? AND l.organization_id = ?`,
    )
    .get(id, user.organization_id);
  if (!lead) return error("Lead not found", 404);
  return json({ lead });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "leads:write");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const db = getDb();

  const existing = db
    .prepare("SELECT * FROM leads WHERE id = ? AND organization_id = ?")
    .get(id, user.organization_id) as Record<string, unknown> | undefined;
  if (!existing) return error("Lead not found", 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const d = parsed.data;
  if (d.ownerUserId && d.ownerUserId !== existing.owner_user_id) {
    const canAssign = user.permissions.includes("leads:assign");
    if (!canAssign) return error("Forbidden", 403, { permission: "leads:assign" });
    assignOwner({
      organizationId: user.organization_id,
      actorUserId: user.id,
      entityType: "lead",
      entityId: id,
      toUserId: d.ownerUserId,
    });
  }

  db.prepare(
    `UPDATE leads SET
       full_name = COALESCE(?, full_name),
       job_title = COALESCE(?, job_title),
       company_name = COALESCE(?, company_name),
       industry = COALESCE(?, industry),
       website = COALESCE(?, website),
       location = COALESCE(?, location),
       headline = COALESCE(?, headline),
       status = COALESCE(?, status),
       metadata_json = COALESCE(?, metadata_json),
       updated_at = datetime('now')
     WHERE id = ? AND organization_id = ?`,
  ).run(
    d.fullName ?? null,
    d.jobTitle ?? null,
    d.companyName ?? null,
    d.industry ?? null,
    d.website ?? null,
    d.location ?? null,
    d.headline ?? null,
    d.status ?? null,
    d.metadata ? JSON.stringify(d.metadata) : null,
    id,
    user.organization_id,
  );

  const lead = db
    .prepare("SELECT * FROM leads WHERE id = ?")
    .get(id);

  writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "lead.patched",
    entityType: "lead",
    entityId: id,
    before: existing,
    after: lead,
  });

  return json({ lead });
}
