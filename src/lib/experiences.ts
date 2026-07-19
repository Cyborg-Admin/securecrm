import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";

export type ExperienceInput = {
  title?: string | null;
  companyName?: string | null;
  companyLinkedinUrl?: string | null;
  location?: string | null;
  startedOn?: string | null;
  endedOn?: string | null;
  isCurrent?: boolean;
  rawText?: string | null;
  sortOrder?: number;
};

export type ExperienceRow = {
  id: string;
  organization_id: string;
  lead_id: string;
  title: string | null;
  company_name: string | null;
  company_linkedin_url: string | null;
  location: string | null;
  started_on: string | null;
  ended_on: string | null;
  is_current: number | boolean;
  raw_text: string | null;
  sort_order: number;
};

/** Replace-set experiences for a lead (tenant-scoped). */
export async function replaceLeadExperiences(input: {
  organizationId: string;
  leadId: string;
  experiences: ExperienceInput[];
}): Promise<number> {
  if (!input.experiences?.length) return 0;

  const db = await getDbAsync();
  const boolTrue = db.driver === "postgres" ? true : 1;
  const boolFalse = db.driver === "postgres" ? false : 0;

  const lead = await db
    .prepare<{ id: string }>(
      `SELECT id FROM leads WHERE id = ? AND organization_id = ?`,
    )
    .get(input.leadId, input.organizationId);
  if (!lead) throw new Error("NOT_FOUND");

  await db
    .prepare(
      `DELETE FROM lead_experiences
       WHERE lead_id = ? AND organization_id = ?`,
    )
    .run(input.leadId, input.organizationId);

  let n = 0;
  for (let i = 0; i < input.experiences.length; i++) {
    const exp = input.experiences[i];
    const title = exp.title?.trim() || null;
    const company = exp.companyName?.trim() || null;
    if (!title && !company && !exp.rawText?.trim()) continue;

    await db
      .prepare(
        `INSERT INTO lead_experiences
         (id, organization_id, lead_id, title, company_name, company_linkedin_url,
          location, started_on, ended_on, is_current, raw_text, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId(),
        input.organizationId,
        input.leadId,
        title,
        company,
        exp.companyLinkedinUrl?.trim() || null,
        exp.location?.trim() || null,
        exp.startedOn?.trim() || null,
        exp.endedOn?.trim() || null,
        exp.isCurrent ? boolTrue : boolFalse,
        exp.rawText?.trim() || null,
        exp.sortOrder ?? i,
      );
    n += 1;
  }
  return n;
}

export async function listLeadExperiences(
  organizationId: string,
  leadId: string,
): Promise<ExperienceRow[]> {
  const db = await getDbAsync();
  return db
    .prepare<ExperienceRow>(
      `SELECT * FROM lead_experiences
       WHERE organization_id = ? AND lead_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
    )
    .all(organizationId, leadId);
}
