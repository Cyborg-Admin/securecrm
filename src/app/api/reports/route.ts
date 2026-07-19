import { NextRequest } from "next/server";
import { isResponse, json, requireUser } from "@/lib/api";
import { getDbAsync } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await requireUser(req, "leads:read");
  if (isResponse(user)) return user;
  const db = await getDbAsync();
  const org = user.organization_id;

  const leadsByStatus = await db
    .prepare<{ status: string; c: number }>(
      `SELECT COALESCE(status, 'unknown') as status, COUNT(*) as c
       FROM leads WHERE organization_id = ?
       GROUP BY status ORDER BY c DESC`,
    )
    .all(org);

  const leadsBySource = await db
    .prepare<{ source: string; c: number }>(
      `SELECT COALESCE(source, 'unknown') as source, COUNT(*) as c
       FROM leads WHERE organization_id = ?
       GROUP BY source ORDER BY c DESC`,
    )
    .all(org);

  const leadsByOwner = await db
    .prepare<{ owner: string; c: number }>(
      `SELECT COALESCE(u.full_name, 'Unassigned') as owner, COUNT(*) as c
       FROM leads l
       LEFT JOIN users u ON u.id = l.owner_user_id
       WHERE l.organization_id = ?
       GROUP BY COALESCE(u.full_name, 'Unassigned')
       ORDER BY c DESC
       LIMIT 8`,
    )
    .all(org);

  const captureByDay = await db
    .prepare<{ day: string; c: number }>(
      db.driver === "postgres"
        ? `SELECT TO_CHAR(created_at::timestamptz, 'YYYY-MM-DD') as day, COUNT(*) as c
           FROM leads
           WHERE organization_id = ?
             AND created_at::timestamptz >= NOW() - INTERVAL '14 days'
           GROUP BY 1 ORDER BY 1 ASC`
        : `SELECT substr(created_at, 1, 10) as day, COUNT(*) as c
           FROM leads
           WHERE organization_id = ?
             AND created_at >= datetime('now', '-14 days')
           GROUP BY substr(created_at, 1, 10)
           ORDER BY day ASC`,
    )
    .all(org);

  const conversion = {
    leads:
      (await db
        .prepare<{ c: number }>("SELECT COUNT(*) as c FROM leads WHERE organization_id = ?")
        .get(org))?.c || 0,
    converted:
      (await db
        .prepare<{ c: number }>(
          "SELECT COUNT(*) as c FROM leads WHERE organization_id = ? AND status = 'converted'",
        )
        .get(org))?.c || 0,
    contacts:
      (await db
        .prepare<{ c: number }>(
          "SELECT COUNT(*) as c FROM contacts WHERE organization_id = ?",
        )
        .get(org))?.c || 0,
    companies:
      (await db
        .prepare<{ c: number }>(
          "SELECT COUNT(*) as c FROM companies WHERE organization_id = ?",
        )
        .get(org))?.c || 0,
  };

  const topCompanies = await db
    .prepare<{ name: string; c: number }>(
      `SELECT COALESCE(c.name, l.company_name, 'Unknown') as name, COUNT(*) as c
       FROM leads l
       LEFT JOIN companies c ON c.id = l.company_id
       WHERE l.organization_id = ?
       GROUP BY COALESCE(c.name, l.company_name, 'Unknown')
       ORDER BY c DESC
       LIMIT 8`,
    )
    .all(org);

  return json({
    leadsByStatus: leadsByStatus.map((r) => ({ name: r.status, value: Number(r.c) })),
    leadsBySource: leadsBySource.map((r) => ({ name: r.source, value: Number(r.c) })),
    leadsByOwner: leadsByOwner.map((r) => ({ name: r.owner, value: Number(r.c) })),
    captureByDay: captureByDay.map((r) => ({ day: r.day, leads: Number(r.c) })),
    topCompanies: topCompanies.map((r) => ({ name: r.name, value: Number(r.c) })),
    conversion: {
      ...conversion,
      rate:
        conversion.leads > 0
          ? Math.round((conversion.converted / conversion.leads) * 100)
          : 0,
    },
  });
}
