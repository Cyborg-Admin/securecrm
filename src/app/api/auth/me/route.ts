import { NextRequest } from "next/server";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { getOrganization } from "@/lib/org";
import { readFileSync } from "fs";
import path from "path";

function appVersion() {
  try {
    const pkg = JSON.parse(
      readFileSync(
        path.join(/* turbopackIgnore: true */ process.cwd(), "package.json"),
        "utf8",
      ),
    ) as { version?: string };
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (isResponse(user)) return user;

  const data = await getOrganization(user.organization_id);
  if (!data) return error("Organization missing", 500);

  return json({
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      organization_id: user.organization_id,
      roles: user.roles,
      permissions: user.permissions,
    },
    organization: {
      id: data.org.id,
      name: data.org.name,
      slug: data.org.slug,
    },
    features: data.features,
    settings: {
      timezone: data.settings.timezone,
      currency: data.settings.currency,
    },
    appVersion: appVersion(),
    csrfToken: user.csrf_secret === "api-key" ? null : user.csrf_secret,
  });
}
