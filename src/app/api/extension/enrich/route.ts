import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { LeadEnrichmentEngine } from "@/lib/enrichment";

const experienceSchema = z.object({
  title: z.string().max(300).optional().nullable(),
  companyName: z.string().max(300).optional().nullable(),
  companyLinkedinUrl: z.string().max(500).optional().nullable(),
  companyLogoUrl: z.string().max(1000).optional().nullable(),
  location: z.string().max(300).optional().nullable(),
  startedOn: z.string().max(80).optional().nullable(),
  endedOn: z.string().max(80).optional().nullable(),
  startedOnSort: z.string().max(10).optional().nullable(),
  endedOnSort: z.string().max(10).optional().nullable(),
  isCurrent: z.boolean().optional(),
  rawText: z.string().max(2000).optional().nullable(),
  sortOrder: z.number().int().min(0).max(200).optional(),
});

const schema = z.object({
  mode: z.enum(["preview", "apply"]).default("preview"),
  overwriteMismatches: z.boolean().default(true),
  source: z.enum(["linkedin", "salesnav", "cognism", "gmail", "automation"]).default("linkedin"),
  sourceUrl: z.string().max(2000).optional().nullable(),
  person: z.object({
    linkedinUrl: z.string().min(5).max(500),
    fullName: z.string().max(200).optional().nullable(),
    jobTitle: z.string().max(200).optional().nullable(),
    companyName: z.string().max(200).optional().nullable(),
    industry: z.string().max(200).optional().nullable(),
    website: z.string().max(300).optional().nullable(),
    location: z.string().max(200).optional().nullable(),
    headline: z.string().max(500).optional().nullable(),
    experiences: z.array(experienceSchema).max(50).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
});

export async function POST(req: NextRequest) {
  const user = await requireUser(req, "extension:capture");
  if (isResponse(user)) return user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const engine = new LeadEnrichmentEngine(user.organization_id, user.id);
  const scraped = parsed.data.person;

  if (parsed.data.mode === "preview") {
    const plan = await engine.analyze(scraped, {
      overwriteMismatches: parsed.data.overwriteMismatches,
    });
    return json({
      mode: "preview",
      plan,
      message: !plan.inCrm
        ? "Not in CRM — capture first, then enrich."
        : plan.updateCount
          ? `${plan.missingCount} missing, ${plan.mismatchCount} mismatched — ${plan.updateCount} field(s) would update.`
          : "CRM already matches scraped data.",
    });
  }

  const result = await engine.apply(scraped, {
    overwriteMismatches: parsed.data.overwriteMismatches,
    source: parsed.data.source,
    sourceUrl: parsed.data.sourceUrl,
  });

  return json({
    mode: "apply",
    ...result,
    message: !result.plan.inCrm
      ? "Not in CRM — capture first, then enrich."
      : result.updated
        ? `Enriched ${result.entityType}: ${result.plan.updateCount} field(s) updated.`
        : "Nothing to update — CRM already matches.",
  });
}
