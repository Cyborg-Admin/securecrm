import { NextRequest } from "next/server";
import { isResponse, json, requireUser } from "@/lib/api";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await requireUser(req, "leads:read");
  if (isResponse(user)) return user;
  const db = getDb();
  const org = user.organization_id;

  const stats = {
    leads: db.prepare<{ c: number }>("SELECT COUNT(*) as c FROM leads WHERE organization_id = ?").get(org)?.c || 0,
    companies: db.prepare<{ c: number }>("SELECT COUNT(*) as c FROM companies WHERE organization_id = ?").get(org)?.c || 0,
    contacts: db.prepare<{ c: number }>("SELECT COUNT(*) as c FROM contacts WHERE organization_id = ?").get(org)?.c || 0,
    users: db.prepare<{ c: number }>("SELECT COUNT(*) as c FROM users WHERE organization_id = ?").get(org)?.c || 0,
    automations: db.prepare<{ c: number }>("SELECT COUNT(*) as c FROM automations WHERE organization_id = ? AND is_active = 1").get(org)?.c || 0,
    myLeads: db.prepare<{ c: number }>("SELECT COUNT(*) as c FROM leads WHERE organization_id = ? AND owner_user_id = ?").get(org, user.id)?.c || 0,
  };

  const recentLeads = db
    .prepare(
      `SELECT id, full_name, job_title, company_name, source, status, updated_at
       FROM leads WHERE organization_id = ?
       ORDER BY updated_at DESC LIMIT 8`,
    )
    .all(org);

  const recentAudit = db
    .prepare(
      `SELECT id, action, entity_type, entity_id, created_at
       FROM audit_logs WHERE organization_id = ?
       ORDER BY created_at DESC LIMIT 8`,
    )
    .all(org);

  return json({ stats, recentLeads, recentAudit });
}
