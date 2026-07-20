import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";

export type ExperienceInput = {
  title?: string | null;
  companyName?: string | null;
  companyLinkedinUrl?: string | null;
  companyLogoUrl?: string | null;
  location?: string | null;
  startedOn?: string | null;
  endedOn?: string | null;
  startedOnSort?: string | null;
  endedOnSort?: string | null;
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
  company_logo_url: string | null;
  location: string | null;
  started_on: string | null;
  ended_on: string | null;
  started_on_sort: string | null;
  ended_on_sort: string | null;
  is_current: number | boolean;
  raw_text: string | null;
  sort_order: number;
};

const MONTH_MAP: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

/** Normalize display date parts to YYYY-MM for chronological sort. */
export function toExperienceSortMonth(
  part: string | null | undefined,
): string | null {
  if (!part || /present/i.test(part)) return null;
  const t = String(part).replace(/\s+/g, " ").trim();
  const withMonth = t.match(
    /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})$/i,
  );
  if (withMonth) {
    const mm = MONTH_MAP[withMonth[1].toLowerCase()];
    return mm ? `${withMonth[2]}-${mm}` : `${withMonth[2]}-01`;
  }
  const yearOnly = t.match(/^(\d{4})$/);
  if (yearOnly) return `${yearOnly[1]}-01`;
  const already = t.match(/^(\d{4})-(\d{2})$/);
  if (already) return `${already[1]}-${already[2]}`;
  return null;
}

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

    const startedOn = exp.startedOn?.trim() || null;
    const endedOn = exp.endedOn?.trim() || null;
    const startedOnSort =
      exp.startedOnSort?.trim() || toExperienceSortMonth(startedOn);
    const endedOnSort =
      exp.endedOnSort?.trim() ||
      (exp.isCurrent ? null : toExperienceSortMonth(endedOn));

    await db
      .prepare(
        `INSERT INTO lead_experiences
         (id, organization_id, lead_id, title, company_name, company_linkedin_url,
          company_logo_url, location, started_on, ended_on, started_on_sort, ended_on_sort,
          is_current, raw_text, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId(),
        input.organizationId,
        input.leadId,
        title,
        company,
        exp.companyLinkedinUrl?.trim() || null,
        exp.companyLogoUrl?.trim() || null,
        exp.location?.trim() || null,
        startedOn,
        endedOn,
        startedOnSort,
        endedOnSort,
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
       ORDER BY is_current DESC,
         CASE WHEN started_on_sort IS NULL THEN 1 ELSE 0 END,
         started_on_sort DESC,
         sort_order ASC,
         created_at ASC`,
    )
    .all(organizationId, leadId);
}
