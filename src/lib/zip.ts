import fs from "fs";
import path from "path";

/** Minimal ZIP (store / no compression) for packaging the extension folder. */
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function u16(n: number) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function u32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

type ZipEntry = { name: string; data: Buffer };

function walkFiles(
  dir: string,
  base = "",
  opts?: { skipDirs?: Set<string> },
): ZipEntry[] {
  const out: ZipEntry[] = [];
  const skipDirs = opts?.skipDirs || new Set<string>();
  for (const name of fs.readdirSync(dir)) {
    if (name === ".DS_Store" || name === "node_modules") continue;
    if (skipDirs.has(name)) continue;
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkFiles(full, rel, opts));
    } else {
      out.push({ name: rel.replace(/\\/g, "/"), data: fs.readFileSync(full) });
    }
  }
  return out;
}

export function zipDirectory(
  dir: string,
  options?: { forChromeWebStore?: boolean },
): Buffer {
  const files = walkFiles(dir, "", {
    skipDirs: options?.forChromeWebStore
      ? new Set(["keys"])
      : new Set<string>(),
  }).map((file) => {
    if (
      options?.forChromeWebStore &&
      file.name === "manifest.json"
    ) {
      try {
        const manifest = JSON.parse(file.data.toString("utf8")) as Record<
          string,
          unknown
        >;
        // Web Store assigns its own ID — local `key` must not be uploaded.
        delete manifest.key;
        return {
          ...file,
          data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
        };
      } catch {
        return file;
      }
    }
    return file;
  });
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const crc = crc32(file.data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      file.data,
    ]);
    localParts.push(local);

    const central = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ]);
    centralParts.push(central);
    offset += local.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...localParts, centralDir, end]);
}
