import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";
import { parseJsonArray, parseJsonObject } from "@/lib/json";

type AutomationAction =
  | { type: "assign_owner"; config: { mode: "actor" | "fixed"; userId?: string } }
  | { type: "set_status"; config: { status: string } }
  | { type: "tag_metadata"; config: { key: string; value: string } };

export async function runAutomations(input: {
  organizationId: string;
  triggerType: string;
  actorUserId: string;
  context: Record<string, unknown>;
}): Promise<void> {
  const db = await getDbAsync();
  const automations = await db
    .prepare<{
      id: string;
      actions_json: string;
      trigger_config: string;
    }>(
      `SELECT id, actions_json, trigger_config FROM automations
       WHERE organization_id = ? AND is_active AND trigger_type = ?`,
    )
    .all(input.organizationId, input.triggerType);

  for (const auto of automations) {
    const runId = newId();
    await db
      .prepare(
        `INSERT INTO automation_runs
       (id, organization_id, automation_id, status, context_json, started_at)
       VALUES (?, ?, ?, 'running', ?, datetime('now'))`,
      )
      .run(runId, input.organizationId, auto.id, JSON.stringify(input.context));

    try {
      const actions = parseJsonArray<AutomationAction>(auto.actions_json);
      const results: unknown[] = [];
      for (const action of actions) {
        results.push(await applyAction(action, input));
      }
      await db
        .prepare(
          `UPDATE automation_runs
         SET status = 'success', result_json = ?, finished_at = datetime('now')
         WHERE id = ?`,
        )
        .run(JSON.stringify(results), runId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Automation failed";
      await db
        .prepare(
          `UPDATE automation_runs
         SET status = 'failed', error_message = ?, finished_at = datetime('now')
         WHERE id = ?`,
        )
        .run(message, runId);
    }
  }
}

async function applyAction(
  action: AutomationAction,
  input: {
    organizationId: string;
    actorUserId: string;
    context: Record<string, unknown>;
  },
): Promise<unknown> {
  const db = await getDbAsync();
  const lead = input.context.lead as { id?: string; metadata_json?: string } | undefined;
  if (!lead?.id) return { skipped: true, reason: "no_lead" };

  if (action.type === "assign_owner") {
    const ownerId =
      action.config.mode === "fixed" && action.config.userId
        ? action.config.userId
        : input.actorUserId;
    await db
      .prepare(
        `UPDATE leads SET owner_user_id = ?, updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
      )
      .run(ownerId, lead.id, input.organizationId);
    await writeAudit({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "automation.assign_owner",
      entityType: "lead",
      entityId: lead.id,
      after: { owner_user_id: ownerId },
    });
    if (ownerId && ownerId !== input.actorUserId) {
      const leadName =
        (input.context.lead as { full_name?: string } | undefined)?.full_name ||
        "a lead";
      await createNotification({
        organizationId: input.organizationId,
        userId: ownerId,
        type: "lead.assigned",
        title: "Lead assigned by automation",
        body: String(leadName),
        href: `/leads?open=${lead.id}`,
        entityType: "lead",
        entityId: lead.id,
        metadata: { via: "automation" },
      });
    }
    return { type: action.type, ownerId };
  }

  if (action.type === "set_status") {
    await db
      .prepare(
        `UPDATE leads SET status = ?, updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
      )
      .run(action.config.status, lead.id, input.organizationId);
    return { type: action.type, status: action.config.status };
  }

  if (action.type === "tag_metadata") {
    const current = await db
      .prepare<{ metadata_json: string }>("SELECT metadata_json FROM leads WHERE id = ?")
      .get(lead.id);
    const meta = parseJsonObject(current?.metadata_json);
    meta[action.config.key] = action.config.value;
    await db
      .prepare(
        `UPDATE leads SET metadata_json = ?, updated_at = datetime('now') WHERE id = ?`,
      )
      .run(JSON.stringify(meta), lead.id);
    return { type: action.type, key: action.config.key };
  }

  return { skipped: true };
}
