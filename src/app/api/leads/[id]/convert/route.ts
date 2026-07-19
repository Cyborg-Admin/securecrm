import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { convertLeadToContact } from "@/lib/contacts";

const schema = z.object({
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(50).optional().nullable(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "contacts:write");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  try {
    const result = await convertLeadToContact({
      organizationId: user.organization_id,
      actorUserId: user.id,
      leadId: id,
      email: parsed.data.email || null,
      phone: parsed.data.phone,
    });
    return json(result, result.created ? 201 : 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Convert failed";
    if (message.includes("NOT_FOUND")) return error("Lead not found", 404);
    return error(message, 400);
  }
}
