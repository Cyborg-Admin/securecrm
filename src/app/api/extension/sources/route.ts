import { NextResponse } from "next/server";
import { readExtensionSourcePack } from "@/lib/extension-pack";

/** Full extension file pack for automatic in-place updates (no zip). */
export async function GET() {
  try {
    const pack = readExtensionSourcePack();
    return NextResponse.json(pack, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Pack failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
