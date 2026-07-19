import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";
import { parseJsonObject } from "@/lib/json";

export type ActivityEntityType = "lead" | "contact" | "company";

export type ActivityInput = {
  organizationId: string;
  actorUserId?: string | null;
  entityType: ActivityEntityType;
  entityId: string;
  activityType: string;
  title: string;
  body?: string | null;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt?: string | null;
};

export type ActivityRow = {
  id: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  activity_type: string;
  title: string;
  body: string | null;
  dedupe_key: string | null;
  actor_user_id: string | null;
  actor_name?: string | null;
  metadata_json: string | Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

export async function recordActivity(
  input: ActivityInput,
): Promise<{ activity: ActivityRow | null; created: boolean }> {
  const db = await getDbAsync();

  if (input.dedupeKey) {
    const existing = await db
      .prepare<ActivityRow>(
        `SELECT * FROM entity_activities
         WHERE organization_id = ? AND dedupe_key = ?
         LIMIT 1`,
      )
      .get(input.organizationId, input.dedupeKey);
    if (existing) return { activity: existing, created: false };
  }

  const id = newId();
  try {
    await db
      .prepare(
        `INSERT INTO entity_activities
         (id, organization_id, entity_type, entity_id, activity_type, title, body,
          dedupe_key, actor_user_id, metadata_json, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`,
      )
      .run(
        id,
        input.organizationId,
        input.entityType,
        input.entityId,
        input.activityType,
        input.title,
        input.body ?? null,
        input.dedupeKey ?? null,
        input.actorUserId ?? null,
        JSON.stringify(input.metadata || {}),
        input.occurredAt ?? null,
      );
  } catch {
    // Unique race on dedupe_key
    if (input.dedupeKey) {
      const existing = await db
        .prepare<ActivityRow>(
          `SELECT * FROM entity_activities
           WHERE organization_id = ? AND dedupe_key = ?
           LIMIT 1`,
        )
        .get(input.organizationId, input.dedupeKey);
      if (existing) return { activity: existing, created: false };
    }
    throw new Error("ACTIVITY_INSERT_FAILED");
  }

  const activity = await db
    .prepare<ActivityRow>(`SELECT * FROM entity_activities WHERE id = ?`)
    .get(id);
  return { activity: activity || null, created: true };
}

export async function listEntityActivities(input: {
  organizationId: string;
  entityType: ActivityEntityType;
  entityId: string;
  limit?: number;
}): Promise<Array<ActivityRow & { metadata: Record<string, unknown> }>> {
  const db = await getDbAsync();
  const limit = Math.min(input.limit || 50, 100);
  const rows = await db
    .prepare<ActivityRow>(
      `SELECT a.*, u.full_name as actor_name
       FROM entity_activities a
       LEFT JOIN users u ON u.id = a.actor_user_id
       WHERE a.organization_id = ?
         AND a.entity_type = ?
         AND a.entity_id = ?
       ORDER BY a.occurred_at DESC
       LIMIT ?`,
    )
    .all(input.organizationId, input.entityType, input.entityId, limit);

  return rows.map((r) => ({
    ...r,
    metadata: parseJsonObject(r.metadata_json),
  }));
}
