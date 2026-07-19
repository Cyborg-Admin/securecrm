import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";
import { parseJsonObject } from "@/lib/json";

export type NotificationInput = {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export type NotificationRow = {
  id: string;
  organization_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  entity_type: string | null;
  entity_id: string | null;
  metadata_json: string | Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

/** Create a notification for one user. Skips if userId is empty. Tenant-scoped. */
export async function createNotification(
  input: NotificationInput,
): Promise<NotificationRow | null> {
  if (!input.userId) return null;
  const db = await getDbAsync();

  // Fail closed: recipient must belong to the same org.
  const member = await db
    .prepare(`SELECT id FROM users WHERE id = ? AND organization_id = ?`)
    .get(input.userId, input.organizationId);
  if (!member) return null;

  const id = newId();
  await db
    .prepare(
      `INSERT INTO notifications
       (id, organization_id, user_id, type, title, body, href, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.organizationId,
      input.userId,
      input.type,
      input.title,
      input.body ?? null,
      input.href ?? null,
      input.entityType ?? null,
      input.entityId ?? null,
      JSON.stringify(input.metadata || {}),
    );

  return (
    (await db
      .prepare<NotificationRow>(`SELECT * FROM notifications WHERE id = ?`)
      .get(id)) || null
  );
}

export async function listNotifications(input: {
  organizationId: string;
  userId: string;
  unreadOnly?: boolean;
  limit?: number;
}): Promise<Array<NotificationRow & { metadata: Record<string, unknown> }>> {
  const db = await getDbAsync();
  const limit = Math.min(input.limit || 30, 50);
  let sql = `SELECT * FROM notifications
             WHERE organization_id = ? AND user_id = ?`;
  const params: unknown[] = [input.organizationId, input.userId];
  if (input.unreadOnly) {
    sql += ` AND read_at IS NULL`;
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = await db.prepare<NotificationRow>(sql).all(...params);
  return rows.map((r) => ({
    ...r,
    metadata: parseJsonObject(r.metadata_json),
  }));
}

export async function countUnreadNotifications(input: {
  organizationId: string;
  userId: string;
}): Promise<number> {
  const db = await getDbAsync();
  const row = await db
    .prepare<{ c: number | string }>(
      `SELECT COUNT(*) as c FROM notifications
       WHERE organization_id = ? AND user_id = ? AND read_at IS NULL`,
    )
    .get(input.organizationId, input.userId);
  return Number(row?.c || 0);
}

export async function markNotificationsRead(input: {
  organizationId: string;
  userId: string;
  ids?: string[];
  all?: boolean;
}): Promise<number> {
  const db = await getDbAsync();
  if (input.all) {
    const res = await db
      .prepare(
        `UPDATE notifications SET read_at = datetime('now')
         WHERE organization_id = ? AND user_id = ? AND read_at IS NULL`,
      )
      .run(input.organizationId, input.userId);
    return res.changes;
  }

  const ids = (input.ids || []).filter(Boolean).slice(0, 50);
  if (!ids.length) return 0;

  let changes = 0;
  for (const id of ids) {
    const res = await db
      .prepare(
        `UPDATE notifications SET read_at = datetime('now')
         WHERE id = ? AND organization_id = ? AND user_id = ? AND read_at IS NULL`,
      )
      .run(id, input.organizationId, input.userId);
    changes += res.changes;
  }
  return changes;
}
