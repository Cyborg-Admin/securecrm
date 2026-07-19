import { readFileSync } from "fs";
import path from "path";
import { json } from "@/lib/api";

function readPackageVersion(): string {
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

/** Public app version for cache-busting / deploy verification. */
export async function GET() {
  const version = readPackageVersion();
  return json({
    name: "KINETIC",
    version,
    builtAt: process.env.BUILD_TIME || null,
    gitSha: process.env.GIT_SHA || process.env.COOLIFY_COMMIT || null,
    checkedAt: new Date().toISOString(),
  });
}
