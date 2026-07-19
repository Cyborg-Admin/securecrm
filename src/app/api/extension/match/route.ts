import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { matchPerson } from "@/lib/match";

const schema = z.object({
  fullName: z.string().max(200).optional().nullable(),
  email: z.string().email().optional().nullable(),
  linkedinUrl: z.string().max(500).optional().nullable(),
  companyName: z.string().max(200).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const user = await requireUser(req, "extension:match");
  if (isResponse(user)) return user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  if (
    !parsed.data.fullName &&
    !parsed.data.email &&
    !parsed.data.linkedinUrl
  ) {
    return error("Provide fullName, email, or linkedinUrl", 400);
  }

  const matches = await matchPerson({
    organizationId: user.organization_id,
    ...parsed.data,
  });

  const best = matches[0] || null;
  const close = best && best.score >= 70;

  return json({
    closeMatch: close,
    best,
    matches,
    suggestAddLead: !close,
  });
}
