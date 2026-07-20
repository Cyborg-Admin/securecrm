import fs from "fs";
import path from "path";

const SKIP_NAMES = new Set([
  ".DS_Store",
  "node_modules",
  ".git",
  "Thumbs.db",
  "keys",
]);

const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pdf",
  ".zip",
  ".crx",
]);

export type ExtensionFileEntry = {
  encoding: "utf8" | "base64";
  content: string;
  bytes: number;
};

export type ExtensionSourcePack = {
  name: string;
  version: string;
  generatedAt: string;
  fileCount: number;
  files: Record<string, ExtensionFileEntry>;
};

function isBinaryName(name: string): boolean {
  return BINARY_EXT.has(path.extname(name).toLowerCase());
}

function walk(dir: string, base = ""): Array<{ rel: string; full: string }> {
  const out: Array<{ rel: string; full: string }> = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_NAMES.has(name)) continue;
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full, rel.replace(/\\/g, "/")));
    } else {
      out.push({ rel: rel.replace(/\\/g, "/"), full });
    }
  }
  return out;
}

export function getExtensionDir(): string {
  return path.join(/* turbopackIgnore: true */ process.cwd(), "extension");
}

export function readExtensionSourcePack(): ExtensionSourcePack {
  const extDir = getExtensionDir();
  if (!fs.existsSync(extDir)) {
    throw new Error("Extension folder missing");
  }

  const manifestPath = path.join(extDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    name?: string;
    version?: string;
  };

  const files: Record<string, ExtensionFileEntry> = {};
  for (const { rel, full } of walk(extDir)) {
    const buf = fs.readFileSync(full);
    if (isBinaryName(rel)) {
      files[rel] = {
        encoding: "base64",
        content: buf.toString("base64"),
        bytes: buf.length,
      };
    } else {
      files[rel] = {
        encoding: "utf8",
        content: buf.toString("utf8"),
        bytes: buf.length,
      };
    }
  }

  return {
    name: manifest.name || "KINETIC Lead Capture",
    version: manifest.version || "0.0.0",
    generatedAt: new Date().toISOString(),
    fileCount: Object.keys(files).length,
    files,
  };
}
