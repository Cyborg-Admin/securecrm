import { NextRequest } from "next/server";
import { isResponse, json, requireUser } from "@/lib/api";
import { getOrganization } from "@/lib/org";
import { resolveExtensionInstallConfig } from "@/lib/extension-install";

/** Install metadata for the in-app Add to Chrome page. */
export async function GET(req: NextRequest) {
  const user = await requireUser(req, "extension:capture");
  if (isResponse(user)) return user;

  const org = await getOrganization(user.organization_id);
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    req.nextUrl.origin ||
    "http://localhost:3000";

  const config = resolveExtensionInstallConfig(
    org?.settings || {
      chromeExtensionStoreUrl: "",
      chromeExtensionId: "",
    },
    origin,
  );

  return json({
    ...config,
    canManage:
      user.permissions.includes("settings:manage") ||
      user.permissions.includes("org:manage"),
  });
}
