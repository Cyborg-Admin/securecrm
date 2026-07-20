import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDbAsync } from "@/lib/db";
import { createContact } from "@/lib/contacts";

const createSchema = z.object({
  fullName: z.string().min(1).max(200),
  linkedinUrl: z.string().max(500).optional().nullable(),
  jobTitle: z.string().max(200).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(50).optional().nullable(),
  companyId: z.string().uuid().optional().nullable(),
  leadId: z.string().uuid().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const user = await requireUser(req, "contacts:read");
  if (isResponse(user)) return user;

  const db = await getDbAsync();
  const q = req.nextUrl.searchParams.get("q")?.trim();
  let sql = `SELECT c.*,
      l.full_name as lead_name,
      co.name as company_name,
      u.full_name as owner_name
    FROM contacts c
    LEFT JOIN leads l
      ON l.id = c.lead_id AND l.organization_id = c.organization_id
    LEFT JOIN companies co
      ON co.id = c.company_id AND co.organization_id = c.organization_id
    LEFT JOIN users u
      ON u.id = c.owner_user_id AND u.organization_id = c.organization_id
    WHERE c.organization_id = ?`;
  const params: unknown[] = [user.organization_id];
  if (q) {
    sql += ` AND (c.full_name LIKE ? OR c.email LIKE ? OR c.job_title LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY c.updated_at DESC LIMIT 100";
  return json({ contacts: await db.prepare(sql).all(...params) });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req, "contacts:write");
  if (isResponse(user)) return user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return error("Validation failed", 400, { details: parsed.error.flatten() });
  }

  try {
    const contact = await createContact({
      organizationId: user.organization_id,
      actorUserId: user.id,
      fullName: parsed.data.fullName,
      linkedinUrl: parsed.data.linkedinUrl,
      jobTitle: parsed.data.jobTitle,
      email: parsed.data.email || null,
      phone: parsed.data.phone,
      companyId: parsed.data.companyId,
      leadId: parsed.data.leadId,
    });
    return json({ contact }, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Create failed";
    if (message.startsWith("DUPLICATE")) return error("Contact already exists", 409);
    return error(message, 400);
  }
}
