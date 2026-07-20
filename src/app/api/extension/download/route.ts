import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { zipDirectory } from "@/lib/zip";

/** Zip the /extension folder for install/update. */
export async function GET() {
  const extDir = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "extension",
  );
  if (!fs.existsSync(extDir)) {
    return NextResponse.json({ error: "Extension folder missing" }, { status: 404 });
  }

  try {
    // Store-ready zip: strips manifest `key` so Chrome Web Store can assign the public ID.
    const bytes = zipDirectory(extDir, { forChromeWebStore: true });
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition":
          'attachment; filename="kinetic-extension.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Zip failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
