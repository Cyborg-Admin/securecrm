import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDbAsync } from "@/lib/db";
import { assertFeatureEnabled } from "@/lib/org";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sku: z.string().max(80).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  unitPrice: z.number().min(0).optional(),
  currency: z.string().max(8).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "products:read");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const db = await getDbAsync();
  const product = await db
    .prepare(`SELECT * FROM products WHERE id = ? AND organization_id = ?`)
    .get(id, user.organization_id);
  if (!product) return error("Product not found", 404);

  const sales = await db
    .prepare(
      `SELECT oli.id, oli.quantity, oli.unit_price, oli.line_total,
              o.id as opportunity_id, o.name as opportunity_name, o.company_id
       FROM opportunity_line_items oli
       JOIN opportunities o ON o.id = oli.opportunity_id
       WHERE oli.product_id = ? AND oli.organization_id = ?
       ORDER BY oli.created_at DESC LIMIT 50`,
    )
    .all(id, user.organization_id);

  return json({ product, sales });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "products:write");
  if (isResponse(user)) return user;
  if (!(await assertFeatureEnabled(user.organization_id, "products"))) {
    return error("Products feature is disabled", 403);
  }
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const db = await getDbAsync();
  const existing = await db
    .prepare(`SELECT * FROM products WHERE id = ? AND organization_id = ?`)
    .get(id, user.organization_id);
  if (!existing) return error("Product not found", 404);

  const bool = (v: boolean) => (db.driver === "postgres" ? v : v ? 1 : 0);
  const d = parsed.data;
  try {
    await db
      .prepare(
        `UPDATE products SET
           name = COALESCE(?, name),
           sku = COALESCE(?, sku),
           description = COALESCE(?, description),
           category = COALESCE(?, category),
           unit_price = COALESCE(?, unit_price),
           currency = COALESCE(?, currency),
           is_active = COALESCE(?, is_active),
           updated_at = datetime('now')
         WHERE id = ? AND organization_id = ?`,
      )
      .run(
        d.name ?? null,
        d.sku === undefined ? null : d.sku,
        d.description === undefined ? null : d.description,
        d.category === undefined ? null : d.category,
        d.unitPrice ?? null,
        d.currency ?? null,
        d.isActive === undefined ? null : bool(d.isActive),
        id,
        user.organization_id,
      );
  } catch {
    return error("SKU already exists in catalogue", 409);
  }

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "product.updated",
    entityType: "product",
    entityId: id,
    after: d,
  });

  const product = await db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
  return json({ product });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "products:delete");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const db = await getDbAsync();

  const used = await db
    .prepare(
      `SELECT 1 FROM opportunity_line_items
       WHERE product_id = ? AND organization_id = ? LIMIT 1`,
    )
    .get(id, user.organization_id);
  if (used) {
    return error(
      "Product is used on opportunities — deactivate it instead of deleting",
      400,
    );
  }

  const res = await db
    .prepare(`DELETE FROM products WHERE id = ? AND organization_id = ?`)
    .run(id, user.organization_id);
  if (!res.changes) return error("Product not found", 404);

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "product.deleted",
    entityType: "product",
    entityId: id,
  });

  return json({ ok: true });
}
