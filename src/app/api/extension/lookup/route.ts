import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDbAsync } from "@/lib/db";
import { normalizeLinkedInUid } from "@/lib/normalize";

const schema = z.object({
  linkedinUrls: z.array(z.string().min(3).max(500)).min(1).max(150),
});

export async function POST(req: NextRequest) {
  const user = await requireUser(req, "extension:match");
  if (isResponse(user)) return user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const db = await getDbAsync();
  const org = user.organization_id;
  const results: Record<
    string,
    {
      inCrm: boolean;
      entityType: "lead" | "contact" | null;
      id: string | null;
      fullName: string | null;
      status: string | null;
    }
  > = {};

  for (const url of parsed.data.linkedinUrls) {
    const uid = normalizeLinkedInUid(url);
    if (!uid) continue;

    const contact = await db
      .prepare<{ id: string; full_name: string }>(
        `SELECT id, full_name FROM contacts
         WHERE organization_id = ? AND linkedin_uid = ?
         LIMIT 1`,
      )
      .get(org, uid);

    if (contact) {
      results[uid] = {
        inCrm: true,
        entityType: "contact",
        id: contact.id,
        fullName: contact.full_name,
        status: "contact",
      };
      continue;
    }

    const lead = await db
      .prepare<{ id: string; full_name: string; status: string }>(
        `SELECT id, full_name, status FROM leads
         WHERE organization_id = ? AND linkedin_uid = ?
         LIMIT 1`,
      )
      .get(org, uid);

    if (lead) {
      results[uid] = {
        inCrm: true,
        entityType: "lead",
        id: lead.id,
        fullName: lead.full_name,
        status: lead.status,
      };
    } else {
      results[uid] = {
        inCrm: false,
        entityType: null,
        id: null,
        fullName: null,
        status: null,
      };
    }
  }

  return json({ results });
}
