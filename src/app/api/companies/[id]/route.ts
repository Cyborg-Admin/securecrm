import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { updateCompany } from "@/lib/companies";
import { getDbAsync } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "companies:read");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const db = await getDbAsync();

  const company = await db
    .prepare(
      `SELECT c.*, u.full_name as owner_name
       FROM companies c
       LEFT JOIN users u ON u.id = c.owner_user_id
       WHERE c.id = ? AND c.organization_id = ?`,
    )
    .get(id, user.organization_id);
  if (!company) return error("Company not found", 404);

  const [leads, contacts, opportunities] = await Promise.all([
    db
      .prepare(
        `SELECT id, full_name, job_title, status, linkedin_uid
         FROM leads WHERE company_id = ? AND organization_id = ?
         ORDER BY updated_at DESC LIMIT 50`,
      )
      .all(id, user.organization_id),
    db
      .prepare(
        `SELECT id, full_name, email, job_title
         FROM contacts WHERE company_id = ? AND organization_id = ?
         ORDER BY updated_at DESC LIMIT 50`,
      )
      .all(id, user.organization_id),
    db
      .prepare(
        `SELECT o.id, o.name, o.amount, o.currency, o.approval_status,
                s.name as stage_name
         FROM opportunities o
         LEFT JOIN pipeline_stages s ON s.id = o.stage_id
         WHERE o.company_id = ? AND o.organization_id = ?
         ORDER BY o.updated_at DESC LIMIT 50`,
      )
      .all(id, user.organization_id),
  ]);

  return json({
    company,
    related: { leads, contacts, opportunities },
  });
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  website: z.string().max(300).optional().nullable(),
  industry: z.string().max(200).optional().nullable(),
  linkedinUrl: z.string().max(500).optional().nullable(),
  employeeCount: z.string().max(50).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
});

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "companies:write");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  try {
    const company = await updateCompany({
      organizationId: user.organization_id,
      actorUserId: user.id,
      companyId: id,
      ...parsed.data,
    });
    return json({ company });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    if (msg === "NOT_FOUND") return error("Company not found", 404);
    if (msg === "NAME_CONFLICT") return error("Company name already exists", 409);
    return error(msg, 400);
  }
}
