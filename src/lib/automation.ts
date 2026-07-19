import { getDb } from "@/lib/db";
import { newId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";

type AutomationAction =
  | { type: "assign_owner"; config: { mode: "actor" | "fixed"; userId?: string } }
  | { type: "set_status"; config: { status: string } }
  | { type: "tag_metadata"; config: { key: string; value: string } };

export function runAutomations(input: {
  organizationId: string;
  triggerType: string;
  actorUserId: string;
  context: Record<string, unknown>;
}): void {
  const db = getDb();
  const automations = db
    .prepare<{
      id: string;
      actions_json: string;
      trigger_config: string;
    }>(
      `SELECT id, actions_json, trigger_config FROM automations
       WHERE organization_id = ? AND is_active = 1 AND trigger_type = ?`,
    )
    .all(input.organizationId, input.triggerType);

  for (const auto of automations) {
    const runId = newId();
    db.prepare(
      `INSERT INTO automation_runs
       (id, organization_id, automation_id, status, context_json, started_at)
       VALUES (?, ?, ?, 'running', ?, datetime('now'))`,
    ).run(runId, input.organizationId, auto.id, JSON.stringify(input.context));

    try {
      const actions = JSON.parse(auto.actions_json || "[]") as AutomationAction[];
      const results: unknown[] = [];
      for (const action of actions) {
        results.push(applyAction(action, input));
      }
      db.prepare(
        `UPDATE automation_runs
         SET status = 'success', result_json = ?, finished_at = datetime('now')
         WHERE id = ?`,
      ).run(JSON.stringify(results), runId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Automation failed";
      db.prepare(
        `UPDATE automation_runs
         SET status = 'failed', error_message = ?, finished_at = datetime('now')
         WHERE id = ?`,
      ).run(message, runId);
    }
  }
}

function applyAction(
  action: AutomationAction,
  input: {
    organizationId: string;
    actorUserId: string;
    context: Record<string, unknown>;
  },
): unknown {
  const db = getDb();
  const lead = input.context.lead as { id?: string; metadata_json?: string } | undefined;
  if (!lead?.id) return { skipped: true, reason: "no_lead" };

  if (action.type === "assign_owner") {
    const ownerId =
      action.config.mode === "fixed" && action.config.userId
        ? action.config.userId
        : input.actorUserId;
    db.prepare(
      `UPDATE leads SET owner_user_id = ?, updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
    ).run(ownerId, lead.id, input.organizationId);
    writeAudit({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "automation.assign_owner",
      entityType: "lead",
      entityId: lead.id,
      after: { owner_user_id: ownerId },
    });
    return { type: action.type, ownerId };
  }

  if (action.type === "set_status") {
    db.prepare(
      `UPDATE leads SET status = ?, updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
    ).run(action.config.status, lead.id, input.organizationId);
    return { type: action.type, status: action.config.status };
  }

  if (action.type === "tag_metadata") {
    const current = db
      .prepare<{ metadata_json: string }>("SELECT metadata_json FROM leads WHERE id = ?")
      .get(lead.id);
    const meta = JSON.parse(current?.metadata_json || "{}");
    meta[action.config.key] = action.config.value;
    db.prepare(
      `UPDATE leads SET metadata_json = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(JSON.stringify(meta), lead.id);
    return { type: action.type, key: action.config.key };
  }

  return { skipped: true };
}
