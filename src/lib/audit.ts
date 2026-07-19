import { getDb } from "@/lib/db";
import { newId } from "@/lib/ids";

export function writeAudit(input: {
  organizationId: string;
  actorUserId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  before?: unknown;
  after?: unknown;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_logs
     (id, organization_id, actor_user_id, action, entity_type, entity_id, ip_address, user_agent, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId(),
    input.organizationId,
    input.actorUserId ?? null,
    input.action,
    input.entityType ?? null,
    input.entityId ?? null,
    input.ipAddress ?? null,
    input.userAgent ?? null,
    input.before ? JSON.stringify(input.before) : null,
    input.after ? JSON.stringify(input.after) : null,
  );
}
