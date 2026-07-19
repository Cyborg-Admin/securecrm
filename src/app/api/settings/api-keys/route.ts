import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDbAsync } from "@/lib/db";
import { newApiKeyPlain, newId } from "@/lib/ids";
import { writeAudit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(100),
});

export async function GET(req: NextRequest) {
  const user = await requireUser(req, "settings:manage");
  if (isResponse(user)) return user;
  const db = await getDbAsync();
  const keys = await db
    .prepare(
      `SELECT id, name, key_prefix, scopes_json, last_used_at, revoked_at, created_at
       FROM api_keys
       WHERE organization_id = ? AND user_id = ?
       ORDER BY created_at DESC`,
    )
    .all(user.organization_id, user.id);
  return json({ keys });
}

export async function POST(req: NextRequest) {
  const user = await requireUser(req, "settings:manage");
  if (isResponse(user)) return user;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const { plain, prefix } = newApiKeyPlain();
  const id = newId();
  const db = await getDbAsync();
  await db
    .prepare(
      `INSERT INTO api_keys
     (id, organization_id, user_id, name, key_hash, key_prefix, scopes_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      user.organization_id,
      user.id,
      parsed.data.name,
      createHash("sha256").update(plain).digest("hex"),
      prefix,
      JSON.stringify([
        "extension:capture",
        "extension:match",
        "leads:write",
        "leads:read",
      ]),
    );

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "api_key.created",
    entityType: "api_key",
    entityId: id,
    after: { name: parsed.data.name, prefix },
  });

  return json(
    {
      id,
      name: parsed.data.name,
      apiKey: plain,
      warning: "Copy this key now. It will not be shown again.",
    },
    201,
  );
}
