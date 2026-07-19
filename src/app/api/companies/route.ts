import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/db";
import { upsertCompany } from "@/lib/companies";

const schema = z.object({
  name: z.string().min(1).max(200),
  website: z.string().max(300).optional().nullable(),
  industry: z.string().max(200).optional().nullable(),
  linkedinUrl: z.string().max(500).optional().nullable(),
  employeeCount: z.string().max(50).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const user = await requireUser(req, "companies:read");
  if (isResponse(user)) return user;
  const db = getDb();
  const q = req.nextUrl.searchParams.get("q")?.trim();
  let sql = `SELECT c.*,
      (SELECT COUNT(*) FROM leads l WHERE l.company_id = c.id) as lead_count,
      (SELECT COUNT(*) FROM contacts ct WHERE ct.company_id = c.id) as contact_count
    FROM companies c WHERE c.organization_id = ?`;
  const params: unknown[] = [user.organization_id];
  if (q) {
    sql += " AND (c.name LIKE ? OR c.domain LIKE ? OR c.industry LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY c.updated_at DESC LIMIT 100";
  return json({ companies: db.prepare(sql).all(...params) });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req, "companies:write");
  if (isResponse(user)) return user;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);
  const result = upsertCompany({
    organizationId: user.organization_id,
    actorUserId: user.id,
    ...parsed.data,
  });
  return json(result, result.created ? 201 : 200);
}
