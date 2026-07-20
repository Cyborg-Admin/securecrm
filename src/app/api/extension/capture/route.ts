import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";
import { captureLead } from "@/lib/leads";

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

const leadSchema = z
  .object({
    linkedinUrl: z
      .preprocess(
        (v) => (typeof v === "string" && !v.trim() ? null : v),
        z.string().min(5).max(500).optional().nullable(),
      ),
    email: z.preprocess(
      (v) => (typeof v === "string" && !v.trim() ? null : v),
      z.string().email().max(320).optional().nullable(),
    ),
    fullName: z.string().min(1).max(200),
    jobTitle: z.string().max(200).optional().nullable(),
    companyName: z.string().max(200).optional().nullable(),
    industry: z.string().max(200).optional().nullable(),
    website: z.string().max(300).optional().nullable(),
    location: z.string().max(200).optional().nullable(),
    headline: z.string().max(500).optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    experiences: z.array(experienceSchema).max(50).optional(),
  })
  .refine(
    (l) => Boolean(l.linkedinUrl) || Boolean(l.email) || Boolean(l.metadata?.gmail_email),
    { message: "linkedinUrl or email required" },
  );

const schema = z.object({
  source: z.enum(["linkedin", "salesnav", "cognism", "gmail"]),
  sourceUrl: z.string().max(2000).optional().nullable(),
  batchId: z.string().uuid().optional().nullable(),
  startBatch: z.boolean().optional(),
  finishBatch: z.boolean().optional(),
  leads: z.array(leadSchema).max(100).default([]),
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
  if (!parsed.success) {
    return error("Validation failed", 400, { details: parsed.error.flatten() });
  }

  const db = await getDbAsync();
  let batchId = parsed.data.batchId || null;

  if ((parsed.data.startBatch || !batchId) && parsed.data.leads.length > 0) {
    batchId = newId();
    await db
      .prepare(
        `INSERT INTO capture_batches
       (id, organization_id, user_id, source, source_url, status)
       VALUES (?, ?, ?, ?, ?, 'running')`,
      )
      .run(
        batchId,
        user.organization_id,
        user.id,
        parsed.data.source,
        parsed.data.sourceUrl ?? null,
      );
  }

  if (!parsed.data.leads.length && parsed.data.finishBatch && batchId) {
    await db
      .prepare(
        `UPDATE capture_batches SET status = 'completed', finished_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
      )
      .run(batchId, user.organization_id);
    return json({ batchId, created: 0, updated: 0, captured: 0, results: [] });
  }

  if (!parsed.data.leads.length) {
    return error("Provide at least one lead, or finishBatch with batchId", 400);
  }

  const results: Array<{
    linkedinUrl: string | null;
    email: string | null;
    created: boolean;
    leadId: string;
  }> = [];
  let created = 0;
  let updated = 0;

  for (const lead of parsed.data.leads) {
    try {
      const { headline: _ignoredHeadline, ...leadFields } = lead;
      const out = await captureLead({
        organizationId: user.organization_id,
        actorUserId: user.id,
        source: parsed.data.source,
        sourceUrl: parsed.data.sourceUrl,
        batchId,
        ...leadFields,
      });
      if (out.created) created += 1;
      else updated += 1;
      results.push({
        linkedinUrl: lead.linkedinUrl ?? null,
        email: lead.email ?? null,
        created: out.created,
        leadId: out.lead.id,
      });
    } catch {
      // skip invalid individual rows
    }
  }

  await db
    .prepare(
      `UPDATE capture_batches SET
       total_captured = total_captured + ?,
       total_created = total_created + ?,
       total_updated = total_updated + ?,
       status = CASE WHEN ? = 1 THEN 'completed' ELSE status END,
       finished_at = CASE WHEN ? = 1 THEN datetime('now') ELSE finished_at END
     WHERE id = ? AND organization_id = ?`,
    )
    .run(
      results.length,
      created,
      updated,
      parsed.data.finishBatch ? 1 : 0,
      parsed.data.finishBatch ? 1 : 0,
      batchId,
      user.organization_id,
    );

  return json({
    batchId,
    created,
    updated,
    captured: results.length,
    results,
  });
}
