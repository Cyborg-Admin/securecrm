import { NextRequest } from "next/server";
import { json } from "@/lib/api";
import { readFileSync } from "fs";
import path from "path";

const FALLBACK_VERSION = "1.3.0";

function readExtensionVersion(): string {
  try {
    const manifestPath = path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "extension",
      "manifest.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      version?: string;
    };
    return manifest.version || FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}

/** Public: extension update metadata (no auth required for version check). */
export async function GET(req: NextRequest) {
  const version = readExtensionVersion();
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    req.nextUrl.origin ||
    "http://localhost:3000";

  return json({
    name: "SecureCRM Lead Capture",
    version,
    downloadUrl: `${base.replace(/\/$/, "")}/api/extension/download`,
    releaseNotes:
      "Trainable scrape recipes, LinkedIn role/appointment history, sequential tab-group deep scrape.",
    minAppVersion: "0.1.0",
    checkedAt: new Date().toISOString(),
  });
}
