import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDbAsync } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { DeleteBlockedError, deleteContact } from "@/lib/deletes";

const patchSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  jobTitle: z.string().max(200).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(50).optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "contacts:read");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const db = await getDbAsync();

  const contact = await db
    .prepare(
      `SELECT c.*, co.name as company_name, l.full_name as lead_name,
              l.id as related_lead_id, u.full_name as owner_name
       FROM contacts c
       LEFT JOIN companies co
         ON co.id = c.company_id AND co.organization_id = c.organization_id
       LEFT JOIN leads l
         ON l.id = c.lead_id AND l.organization_id = c.organization_id
       LEFT JOIN users u
         ON u.id = c.owner_user_id AND u.organization_id = c.organization_id
       WHERE c.id = ? AND c.organization_id = ?`,
    )
    .get(id, user.organization_id);

  if (!contact) return error("Contact not found", 404);

  const relatedLeads = await db
    .prepare(
      `SELECT id, full_name, job_title, company_name, status, linkedin_uid
       FROM leads
       WHERE organization_id = ?
         AND (id = ? OR (linkedin_uid IS NOT NULL AND linkedin_uid = ?) OR company_id = ?)
       ORDER BY updated_at DESC LIMIT 20`,
    )
    .all(
      user.organization_id,
      (contact as { lead_id: string | null }).lead_id,
      (contact as { linkedin_uid: string | null }).linkedin_uid,
      (contact as { company_id: string | null }).company_id,
    );

  return json({ contact, relatedLeads });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "contacts:write");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const db = await getDbAsync();

  const existing = await db
    .prepare("SELECT * FROM contacts WHERE id = ? AND organization_id = ?")
    .get(id, user.organization_id);
  if (!existing) return error("Contact not found", 404);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const d = parsed.data;
  await db
    .prepare(
      `UPDATE contacts SET
       full_name = COALESCE(?, full_name),
       job_title = COALESCE(?, job_title),
       email = COALESCE(?, email),
       phone = COALESCE(?, phone),
       company_id = COALESCE(?, company_id),
       updated_at = datetime('now')
     WHERE id = ? AND organization_id = ?`,
    )
    .run(
      d.fullName ?? null,
      d.jobTitle ?? null,
      d.email === "" ? null : d.email ?? null,
      d.phone ?? null,
      d.companyId ?? null,
      id,
      user.organization_id,
    );

  const contact = await db
    .prepare(
      `SELECT c.*, co.name as company_name, l.full_name as lead_name,
              l.id as related_lead_id, u.full_name as owner_name
       FROM contacts c
       LEFT JOIN companies co
         ON co.id = c.company_id AND co.organization_id = c.organization_id
       LEFT JOIN leads l
         ON l.id = c.lead_id AND l.organization_id = c.organization_id
       LEFT JOIN users u
         ON u.id = c.owner_user_id AND u.organization_id = c.organization_id
       WHERE c.id = ? AND c.organization_id = ?`,
    )
    .get(id, user.organization_id);
  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "contact.patched",
    entityType: "contact",
    entityId: id,
    before: existing,
    after: contact,
  });
  return json({ contact });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "contacts:delete");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  try {
    await deleteContact({
      organizationId: user.organization_id,
      actorUserId: user.id,
      contactId: id,
    });
    return json({ ok: true });
  } catch (e) {
    if (e instanceof DeleteBlockedError) return error(e.message, 400);
    if (e instanceof Error && e.message === "NOT_FOUND") {
      return error("Contact not found", 404);
    }
    throw e;
  }
}
