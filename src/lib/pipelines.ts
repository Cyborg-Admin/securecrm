import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";

export type PipelineKey =
  | "lead"
  | "opportunity"
  | "event_sales"
  | "event_delegate";

export const PIPELINE_KEYS: PipelineKey[] = [
  "lead",
  "opportunity",
  "event_sales",
  "event_delegate",
];

export type StageRow = {
  id: string;
  organization_id: string;
  pipeline_key: string;
  name: string;
  sort_order: number;
  probability: number;
  is_won: number | boolean;
  is_lost: number | boolean;
  requires_approval: number | boolean;
};

const DEFAULTS: Record<
  PipelineKey,
  Array<{
    name: string;
    probability: number;
    isWon?: boolean;
    isLost?: boolean;
    requiresApproval?: boolean;
  }>
> = {
  lead: [
    { name: "New", probability: 10 },
    { name: "Contacted", probability: 25 },
    { name: "Qualified", probability: 45 },
    { name: "Meeting", probability: 65 },
    { name: "Proposal", probability: 80 },
    { name: "Converted", probability: 100, isWon: true },
    { name: "Disqualified", probability: 0, isLost: true },
  ],
  opportunity: [
    { name: "Prospecting", probability: 10 },
    { name: "Qualification", probability: 25 },
    { name: "Proposal", probability: 50, requiresApproval: true },
    { name: "Negotiation", probability: 75 },
    { name: "Closed Won", probability: 100, isWon: true },
    { name: "Closed Lost", probability: 0, isLost: true },
  ],
  event_sales: [
    { name: "Identified", probability: 10 },
    { name: "Outreach", probability: 30 },
    { name: "Committed", probability: 70 },
    { name: "Booked", probability: 100, isWon: true },
    { name: "Lost", probability: 0, isLost: true },
  ],
  event_delegate: [
    { name: "Invited", probability: 20 },
    { name: "Registered", probability: 60 },
    { name: "Confirmed", probability: 90 },
    { name: "Attended", probability: 100, isWon: true },
    { name: "Cancelled", probability: 0, isLost: true },
  ],
};

/** Normalize a stage name to the value stored on leads.status. */
export function stageStatusKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export async function ensureDefaultStages(organizationId: string): Promise<void> {
  const db = await getDbAsync();
  const bool = (v: boolean) => (db.driver === "postgres" ? v : v ? 1 : 0);

  for (const [pipelineKey, stages] of Object.entries(DEFAULTS) as Array<
    [PipelineKey, (typeof DEFAULTS)[PipelineKey]]
  >) {
    const count = await db
      .prepare<{ c: number | string }>(
        `SELECT COUNT(*) as c FROM pipeline_stages
         WHERE organization_id = ? AND pipeline_key = ?`,
      )
      .get(organizationId, pipelineKey);
    if (Number(count?.c || 0) > 0) continue;

    let order = 0;
    for (const s of stages) {
      await db
        .prepare(
          `INSERT INTO pipeline_stages
           (id, organization_id, pipeline_key, name, sort_order, probability, is_won, is_lost, requires_approval)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          newId(),
          organizationId,
          pipelineKey,
          s.name,
          order++,
          s.probability,
          bool(Boolean(s.isWon)),
          bool(Boolean(s.isLost)),
          bool(Boolean(s.requiresApproval)),
        );
    }
  }
}

export async function listStages(
  organizationId: string,
  pipelineKey?: PipelineKey,
): Promise<StageRow[]> {
  const db = await getDbAsync();
  if (pipelineKey) {
    return db
      .prepare<StageRow>(
        `SELECT * FROM pipeline_stages
         WHERE organization_id = ? AND pipeline_key = ?
         ORDER BY sort_order ASC`,
      )
      .all(organizationId, pipelineKey);
  }
  return db
    .prepare<StageRow>(
      `SELECT * FROM pipeline_stages
       WHERE organization_id = ?
       ORDER BY pipeline_key ASC, sort_order ASC`,
    )
    .all(organizationId);
}
