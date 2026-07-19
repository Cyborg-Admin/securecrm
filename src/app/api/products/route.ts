import { NextRequest } from "next/server";
import { z } from "zod";
import { error, isResponse, json, requireUser } from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { getDbAsync } from "@/lib/db";
import { newId } from "@/lib/ids";
import { assertFeatureEnabled, getOrganization } from "@/lib/org";

export async function GET(req: NextRequest) {
  const user = await requireUser(req, "products:read");
  if (isResponse(user)) return user;
  if (!(await assertFeatureEnabled(user.organization_id, "products"))) {
    return error("Products feature is disabled", 403);
  }

  const db = await getDbAsync();
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const activeOnly = req.nextUrl.searchParams.get("active") === "1";
  let sql = `SELECT p.*,
      (SELECT COUNT(*) FROM opportunity_line_items oli
       WHERE oli.product_id = p.id) as times_sold
     FROM products p
     WHERE p.organization_id = ?`;
  const params: unknown[] = [user.organization_id];
  if (activeOnly) {
    sql += db.driver === "postgres" ? ` AND p.is_active = TRUE` : ` AND p.is_active = 1`;
  }
  if (q) {
    sql += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.category LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ` ORDER BY p.updated_at DESC LIMIT 200`;
  const products = await db.prepare(sql).all(...params);
  return json({ products });
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(80).optional().nullable(),
  description: z.string().max(5000).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  unitPrice: z.number().min(0).default(0),
  currency: z.string().max(8).optional(),
  isActive: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  const user = await requireUser(req, "products:write");
  if (isResponse(user)) return user;
  if (!(await assertFeatureEnabled(user.organization_id, "products"))) {
    return error("Products feature is disabled", 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON", 400);
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return error("Validation failed", 400);

  const org = await getOrganization(user.organization_id);
  const db = await getDbAsync();
  const id = newId();
  const bool = (v: boolean) => (db.driver === "postgres" ? v : v ? 1 : 0);
  const sku = parsed.data.sku?.trim() || null;

  try {
    await db
      .prepare(
        `INSERT INTO products
         (id, organization_id, sku, name, description, category, unit_price, currency, is_active, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        user.organization_id,
        sku,
        parsed.data.name.trim(),
        parsed.data.description ?? null,
        parsed.data.category ?? null,
        parsed.data.unitPrice,
        parsed.data.currency || org?.settings.currency || "GBP",
        bool(parsed.data.isActive),
        user.id,
      );
  } catch {
    return error("SKU already exists in catalogue", 409);
  }

  await writeAudit({
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "product.created",
    entityType: "product",
    entityId: id,
    after: parsed.data,
  });

  const product = await db.prepare(`SELECT * FROM products WHERE id = ?`).get(id);
  return json({ product }, 201);
}
