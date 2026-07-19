import { NextRequest } from "next/server";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getDbAsync } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (isResponse(user)) return user;

  const db = await getDbAsync();
  const org = await db
    .prepare<{ id: string; name: string; slug: string }>(
      "SELECT id, name, slug FROM organizations WHERE id = ?",
    )
    .get(user.organization_id);

  if (!org) return error("Organization missing", 500);

  return json({
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      organization_id: user.organization_id,
      roles: user.roles,
      permissions: user.permissions,
    },
    organization: org,
    csrfToken: user.csrf_secret === "api-key" ? null : user.csrf_secret,
  });
}
