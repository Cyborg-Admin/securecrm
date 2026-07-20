import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { logEmailScanForMatch } from "@/lib/email-activity";
import { matchPerson } from "@/lib/match";

const schema = z.object({
  fullName: z.string().max(200).optional().nullable(),
  email: z.preprocess(
    (v) => (typeof v === "string" && !v.trim() ? null : v),
    z.string().email().optional().nullable(),
  ),
  linkedinUrl: z.string().max(500).optional().nullable(),
  companyName: z.string().max(200).optional().nullable(),
  emailContext: z
    .object({
      subject: z.string().max(500).optional().nullable(),
      fromEmail: z.string().max(320).optional().nullable(),
      fromName: z.string().max(200).optional().nullable(),
      toEmails: z.array(z.string().max(320)).max(20).optional(),
      ccEmails: z.array(z.string().max(320)).max(20).optional(),
      sourceUrl: z.string().max(2000).optional().nullable(),
      snippet: z.string().max(2000).optional().nullable(),
      bodyText: z.string().max(8000).optional().nullable(),
      externalThreadId: z.string().max(200).optional().nullable(),
      externalMessageId: z.string().max(200).optional().nullable(),
      sentAt: z.string().max(80).optional().nullable(),
      direction: z.enum(["inbound", "outbound", "unknown"]).optional(),
    })
    .optional(),
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

  let activityLogged = false;
  if (close && best && parsed.data.emailContext) {
    const ctx = parsed.data.emailContext;
    const result = await logEmailScanForMatch({
      organizationId: user.organization_id,
      actorUserId: user.id,
      match: best,
      email: {
        subject: ctx.subject,
        fromEmail: ctx.fromEmail || parsed.data.email,
        fromName: ctx.fromName || parsed.data.fullName,
        toEmails: ctx.toEmails,
        ccEmails: ctx.ccEmails,
        sourceUrl: ctx.sourceUrl,
        snippet: ctx.snippet,
        bodyText: ctx.bodyText,
        externalThreadId: ctx.externalThreadId,
        externalMessageId: ctx.externalMessageId,
        sentAt: ctx.sentAt,
        direction: ctx.direction,
      },
    });
    activityLogged = result.created || result.leadCreated;
  }

  return json({
    closeMatch: close,
    best,
    matches,
    suggestAddLead: !close,
    activityLogged,
  });
}
