import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDbAsync } from "@/lib/db";
import { parseFeatures, parseOrgSettings } from "@/lib/features";
import { getOrganization } from "@/lib/org";

export async function GET(req: NextRequest) {
  const user = await requireUser(req, "org:manage");
  if (isResponse(user)) return user;

  const data = await getOrganization(user.organization_id);
  if (!data) return error("Organization not found", 404);

  return json({
    organization: {
      id: data.org.id,
      name: data.org.name,
      slug: data.org.slug,
    },
    settings: data.settings,
    features: data.features,
  });
}

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  settings: z
    .object({
      timezone: z.string().max(80).optional(),
      currency: z.string().max(8).optional(),
      opportunityApproval: z
        .object({
          enabled: z.boolean().optional(),
          requireApprovalStageIds: z.array(z.string().uuid()).optional(),
          approverUserIds: z.array(z.string().uuid()).optional(),
        })
        .optional(),
    })
    .optional(),
  features: z.record(z.string(), z.boolean()).optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await requireUser(req, "org:manage");
  if (isResponse(user)) return user;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const current = await getOrganization(user.organization_id);
  if (!current) return error("Organization not found", 404);

  const db = await getDbAsync();
  const nextSettings = parseOrgSettings({
    ...current.settings,
    ...(parsed.data.settings || {}),
    opportunityApproval: {
      ...current.settings.opportunityApproval,
      ...(parsed.data.settings?.opportunityApproval || {}),
    },
  });
  const nextFeatures = parseFeatures({
    ...current.features,
    ...(parsed.data.features || {}),
  });

  const name = parsed.data.name ?? current.org.name;
  const slug = parsed.data.slug ?? current.org.slug;

  if (slug !== current.org.slug) {
    const clash = await db
      .prepare(`SELECT id FROM organizations WHERE slug = ? AND id != ?`)
      .get(slug, user.organization_id);
    if (clash) return error("Slug already in use", 409);
  }

  await db
    .prepare(
      `UPDATE organizations
       SET name = ?, slug = ?, settings_json = ?, features_json = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(
      name,
      slug,
      JSON.stringify(nextSettings),
      JSON.stringify(nextFeatures),
      user.organization_id,
    );

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "org.updated",
    entityType: "organization",
    entityId: user.organization_id,
    before: {
      name: current.org.name,
      slug: current.org.slug,
      settings: current.settings,
      features: current.features,
    },
    after: { name, slug, settings: nextSettings, features: nextFeatures },
  });

  return json({
    organization: { id: user.organization_id, name, slug },
    settings: nextSettings,
    features: nextFeatures,
  });
}
