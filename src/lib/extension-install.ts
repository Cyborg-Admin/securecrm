import { readFileSync } from "fs";
import path from "path";
import type { OrgSettings } from "@/lib/features";

/** Default ID from extension/manifest.json `key` (unpacked / pre-store). */
export const DEFAULT_EXTENSION_ID = "dlaplkgneaeodolklfiinmebncnpaagk";

export function readExtensionManifestVersion(): string {
  try {
    const manifestPath = path.join(
      /* turbopackIgnore: true */ process.cwd(),
      "extension",
      "manifest.json",
    );
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      version?: string;
    };
    return manifest.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function resolveExtensionInstallConfig(
  settings: Pick<OrgSettings, "chromeExtensionStoreUrl" | "chromeExtensionId">,
  origin: string,
) {
  const base = origin.replace(/\/$/, "");
  const storeUrl = (
    settings.chromeExtensionStoreUrl ||
    process.env.NEXT_PUBLIC_CHROME_EXTENSION_STORE_URL ||
    ""
  ).trim();
  const extensionId = (
    settings.chromeExtensionId ||
    process.env.NEXT_PUBLIC_CHROME_EXTENSION_ID ||
    DEFAULT_EXTENSION_ID
  ).trim();

  return {
    name: "KINETIC Lead Capture",
    version: readExtensionManifestVersion(),
    storeUrl,
    extensionId,
    downloadUrl: `${base}/api/extension/download`,
    sourcesUrl: `${base}/api/extension/sources`,
    canOneClickInstall: Boolean(storeUrl),
  };
}
