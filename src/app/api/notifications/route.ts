import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationsRead,
} from "@/lib/notifications";

export async function GET(req: NextRequest) {
  const user = await requireUser(req);
  if (isResponse(user)) return user;

  const unreadOnly = req.nextUrl.searchParams.get("unread") === "1";
  const limit = Number(req.nextUrl.searchParams.get("limit") || 30);

  const [notifications, unreadCount] = await Promise.all([
    listNotifications({
      organizationId: user.organization_id,
      userId: user.id,
      unreadOnly,
      limit,
    }),
    countUnreadNotifications({
      organizationId: user.organization_id,
      userId: user.id,
    }),
  ]);

  return json({ notifications, unreadCount });
}

const patchSchema = z.object({
  ids: z.array(z.string().uuid()).max(50).optional(),
  all: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req);
  if (isResponse(user)) return user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);
  if (!parsed.data.all && !parsed.data.ids?.length) {
    return error("Provide ids or all: true", 400);
  }

  const updated = await markNotificationsRead({
    organizationId: user.organization_id,
    userId: user.id,
    ids: parsed.data.ids,
    all: parsed.data.all,
  });

  const unreadCount = await countUnreadNotifications({
    organizationId: user.organization_id,
    userId: user.id,
  });

  return json({ updated, unreadCount });
}
