import { NextRequest } from "next/server";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDbAsync } from "@/lib/db";
import { listLeadExperiences } from "@/lib/experiences";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "leads:read");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const db = await getDbAsync();

  const lead = (await db
    .prepare(`SELECT * FROM leads WHERE id = ? AND organization_id = ?`)
    .get(id, user.organization_id)) as
    | {
        id: string;
        company_id: string | null;
        linkedin_uid: string;
      }
    | undefined;

  if (!lead) return error("Lead not found", 404);

  const company = lead.company_id
    ? await db
        .prepare(
          `SELECT id, name, domain, industry, website, location FROM companies
           WHERE id = ? AND organization_id = ?`,
        )
        .get(lead.company_id, user.organization_id)
    : null;

  const contact = await db
    .prepare(
      `SELECT id, full_name, email, phone, job_title, linkedin_uid, company_id
       FROM contacts
       WHERE organization_id = ?
         AND (lead_id = ? OR (linkedin_uid IS NOT NULL AND linkedin_uid = ?))
       LIMIT 1`,
    )
    .get(user.organization_id, lead.id, lead.linkedin_uid);

  const siblingLeads = lead.company_id
    ? await db
        .prepare(
          `SELECT id, full_name, job_title, status, linkedin_uid
           FROM leads
           WHERE organization_id = ? AND company_id = ? AND id != ?
           ORDER BY updated_at DESC LIMIT 12`,
        )
        .all(user.organization_id, lead.company_id, lead.id)
    : [];

  let experiences: Awaited<ReturnType<typeof listLeadExperiences>> = [];
  try {
    experiences = await listLeadExperiences(user.organization_id, lead.id);
  } catch {
    experiences = [];
  }

  return json({ company, contact, siblingLeads, experiences });
}
