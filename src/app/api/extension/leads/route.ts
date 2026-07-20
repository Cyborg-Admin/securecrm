import { NextRequest } from "next/server";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDbAsync } from "@/lib/db";

/** Tenant-scoped lead search for the Chrome extension (session auth). */
export async function GET(req: NextRequest) {
  const user = await requireUser(req, "leads:read");
  if (isResponse(user)) return user;

  const db = await getDbAsync();
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const status = req.nextUrl.searchParams.get("status")?.trim();
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit") || 50),
    200,
  );

  let sql = `SELECT l.*, u.full_name as owner_name, c.name as company_display
             FROM leads l
             LEFT JOIN users u
               ON u.id = l.owner_user_id AND u.organization_id = l.organization_id
             LEFT JOIN companies c
               ON c.id = l.company_id AND c.organization_id = l.organization_id
             WHERE l.organization_id = ?`;
  const params: unknown[] = [user.organization_id];

  if (status) {
    sql += " AND l.status = ?";
    params.push(status);
  }
  if (q) {
    sql +=
      " AND (l.full_name LIKE ? OR l.company_name LIKE ? OR l.job_title LIKE ? OR l.email LIKE ? OR l.linkedin_uid LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY l.updated_at DESC LIMIT ?";
  params.push(limit);

  const leads = await db.prepare(sql).all(...params);
  return json({ leads });
}
