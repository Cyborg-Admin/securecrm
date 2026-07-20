import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDbAsync } from "@/lib/db";
import { captureLead } from "@/lib/leads";

const captureSchema = z
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
    source: z
      .enum(["linkedin", "salesnav", "cognism", "gmail", "manual"])
      .default("manual"),
    sourceUrl: z.string().max(1000).optional().nullable(),
    ownerUserId: z.string().uuid().optional().nullable(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((l) => Boolean(l.linkedinUrl) || Boolean(l.email), {
    message: "linkedinUrl or email required",
  });

export async function GET(req: NextRequest) {
  const user = await requireUser(req, "leads:read");
  if (isResponse(user)) return user;

  const db = await getDbAsync();
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const status = req.nextUrl.searchParams.get("status")?.trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 200);

  let sql = `SELECT l.*, u.full_name as owner_name, c.name as company_display
             FROM leads l
             LEFT JOIN users u ON u.id = l.owner_user_id
             LEFT JOIN companies c ON c.id = l.company_id
             WHERE l.organization_id = ?`;
  const params: unknown[] = [user.organization_id];

  if (status) {
    sql += " AND l.status = ?";
    params.push(status);
  }
  if (q) {
    sql +=
      " AND (l.full_name LIKE ? OR l.company_name LIKE ? OR l.job_title LIKE ? OR l.email LIKE ? OR l.linkedin_uid LIKE ?)";
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += " ORDER BY l.updated_at DESC LIMIT ?";
  params.push(limit);

  const leads = await db.prepare(sql).all(...params);
  return json({ leads });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req, "leads:write");
  if (isResponse(user)) return user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }

  const parsed = captureSchema.safeParse(body);
  if (!parsed.success) {
    return error("Validation failed", 400, { details: parsed.error.flatten() });
  }

  try {
    const result = await captureLead({
      organizationId: user.organization_id,
      actorUserId: user.id,
      ...parsed.data,
    });
    return json(
      { lead: result.lead, created: result.created, companyId: result.companyId },
      result.created ? 201 : 200,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Capture failed";
    return error(message, 400);
  }
}
