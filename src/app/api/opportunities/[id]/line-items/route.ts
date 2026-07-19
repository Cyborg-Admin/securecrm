import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "opportunities:read");
  if (isResponse(user)) return user;
  const { id } = await ctx.params;
  const db = await getDbAsync();

  const opp = await db
    .prepare(`SELECT id FROM opportunities WHERE id = ? AND organization_id = ?`)
    .get(id, user.organization_id);
  if (!opp) return error("Opportunity not found", 404);

  const lineItems = await db
    .prepare(
      `SELECT oli.*, p.name as product_name, p.sku as product_sku, p.currency as product_currency
       FROM opportunity_line_items oli
       JOIN products p ON p.id = oli.product_id
       WHERE oli.opportunity_id = ? AND oli.organization_id = ?
       ORDER BY oli.created_at ASC`,
    )
    .all(id, user.organization_id);

  const total = lineItems.reduce(
    (sum, row) => sum + Number((row as { line_total: number }).line_total || 0),
    0,
  );

  return json({ lineItems, total });
}

const createSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().min(0).optional(),
  discount: z.number().min(0).default(0),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  const user = await requireUser(req, "opportunities:write");
  if (isResponse(user)) return user;
  const { id: opportunityId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const db = await getDbAsync();
  const opp = await db
    .prepare(
      `SELECT id FROM opportunities WHERE id = ? AND organization_id = ?`,
    )
    .get(opportunityId, user.organization_id);
  if (!opp) return error("Opportunity not found", 404);

  const product = await db
    .prepare<{ id: string; unit_price: number; is_active: number | boolean }>(
      `SELECT id, unit_price, is_active FROM products
       WHERE id = ? AND organization_id = ?`,
    )
    .get(parsed.data.productId, user.organization_id);
  if (!product) return error("Product not found", 404);
  if (!product.is_active) return error("Product is inactive", 400);

  const unitPrice =
    parsed.data.unitPrice !== undefined
      ? parsed.data.unitPrice
      : Number(product.unit_price || 0);
  const quantity = parsed.data.quantity;
  const discount = parsed.data.discount;
  const lineTotal = Math.max(0, unitPrice * quantity - discount);
  const id = newId();

  await db
    .prepare(
      `INSERT INTO opportunity_line_items
       (id, organization_id, opportunity_id, product_id, quantity, unit_price, discount, line_total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      user.organization_id,
      opportunityId,
      parsed.data.productId,
      quantity,
      unitPrice,
      discount,
      lineTotal,
    );

  // Roll opportunity amount up from line items
  const sumRow = await db
    .prepare<{ total: number | string }>(
      `SELECT COALESCE(SUM(line_total), 0) as total
       FROM opportunity_line_items
       WHERE opportunity_id = ? AND organization_id = ?`,
    )
    .get(opportunityId, user.organization_id);
  await db
    .prepare(
      `UPDATE opportunities SET amount = ?, updated_at = datetime('now')
       WHERE id = ? AND organization_id = ?`,
    )
    .run(Number(sumRow?.total || 0), opportunityId, user.organization_id);

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "opportunity.line_item_added",
    entityType: "opportunity",
    entityId: opportunityId,
    after: { lineItemId: id, productId: parsed.data.productId, lineTotal },
  });

  const lineItem = await db
    .prepare(`SELECT * FROM opportunity_line_items WHERE id = ?`)
    .get(id);
  return json({ lineItem, opportunityAmount: Number(sumRow?.total || 0) }, 201);
}
