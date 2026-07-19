"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/client-api";

type Product = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  category: string | null;
  unit_price: number;
  currency: string;
  is_active: number | boolean;
  times_sold?: number | string;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    sku: "",
    category: "",
    unitPrice: "",
    description: "",
  });
  const [edit, setEdit] = useState({
    name: "",
    sku: "",
    category: "",
    unitPrice: "",
    description: "",
    isActive: true,
  });

  async function load(query = q) {
    const data = await api<{ products: Product[] }>(
      `/api/products?q=${encodeURIComponent(query)}`,
    );
    setProducts(data.products);
  }

  useEffect(() => {
    void load("").catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  function selectProduct(p: Product) {
    setSelected(p);
    setEdit({
      name: p.name,
      sku: p.sku || "",
      category: p.category || "",
      unitPrice: String(p.unit_price ?? ""),
      description: p.description || "",
      isActive: Boolean(p.is_active),
    });
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<{ product: Product }>("/api/products", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          sku: form.sku || null,
          category: form.category || null,
          unitPrice: form.unitPrice ? Number(form.unitPrice) : 0,
          description: form.description || null,
        }),
      });
      setForm({ name: "", sku: "", category: "", unitPrice: "", description: "" });
      await load(q);
      if (res.product) selectProduct(res.product);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    try {
      const res = await api<{ product: Product }>(`/api/products/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: edit.name,
          sku: edit.sku || null,
          category: edit.category || null,
          unitPrice: edit.unitPrice ? Number(edit.unitPrice) : 0,
          description: edit.description || null,
          isActive: edit.isActive,
        }),
      });
      setSelected(res.product);
      await load(q);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <AppShell>
      <h1 className="display text-3xl">Products</h1>
      <p className="mt-1 text-[var(--neo-muted)]">
        Catalogue of products and services you sell. Attach them to opportunities
        as line items.
      </p>
      {error ? (
        <p className="mt-2 text-sm text-[var(--neo-danger)]">{error}</p>
      ) : null}

      <form
        onSubmit={onCreate}
        className="neo-raised mt-5 grid gap-3 p-4 md:grid-cols-2"
      >
        <input
          className="neo-input"
          placeholder="Product name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
        <input
          className="neo-input"
          placeholder="SKU (optional)"
          value={form.sku}
          onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
        />
        <input
          className="neo-input"
          placeholder="Category"
          value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
        />
        <input
          className="neo-input"
          type="number"
          min="0"
          step="0.01"
          placeholder="Unit price"
          value={form.unitPrice}
          onChange={(e) => setForm((f) => ({ ...f, unitPrice: e.target.value }))}
        />
        <input
          className="neo-input md:col-span-2"
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        />
        <button className="neo-btn neo-btn-primary md:col-span-2" type="submit">
          Add to catalogue
        </button>
      </form>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.95fr]">
        <section className="neo-raised p-4">
          <input
            className="neo-input"
            placeholder="Search catalogue…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="mt-4 max-h-[60vh] space-y-2 overflow-auto">
            {products.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`w-full rounded-2xl p-3 text-left ${
                    selected?.id === p.id ? "neo-pressed" : "neo-inset"
                  }`}
                  onClick={() => selectProduct(p)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{p.name}</p>
                    {!p.is_active ? (
                      <span className="record-chip muted">Inactive</span>
                    ) : null}
                  </div>
                  <p className="text-sm text-[var(--neo-muted)]">
                    {[p.sku, p.category].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--neo-muted)]">
                    {p.currency} {Number(p.unit_price || 0).toLocaleString()} · sold{" "}
                    {Number(p.times_sold || 0)}×
                  </p>
                </button>
              </li>
            ))}
            {!products.length ? (
              <li className="py-6 text-center text-sm text-[var(--neo-muted)]">
                No products yet.
              </li>
            ) : null}
          </ul>
        </section>

        <aside className="neo-raised p-4">
          {selected ? (
            <form onSubmit={onSave} className="space-y-3">
              <h2 className="display text-2xl">Edit product</h2>
              <label className="block text-sm">
                <span className="text-[var(--neo-muted)]">Name</span>
                <input
                  className="neo-input mt-1"
                  value={edit.name}
                  onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--neo-muted)]">SKU</span>
                <input
                  className="neo-input mt-1"
                  value={edit.sku}
                  onChange={(e) => setEdit((x) => ({ ...x, sku: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--neo-muted)]">Category</span>
                <input
                  className="neo-input mt-1"
                  value={edit.category}
                  onChange={(e) =>
                    setEdit((x) => ({ ...x, category: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--neo-muted)]">Unit price</span>
                <input
                  className="neo-input mt-1"
                  type="number"
                  min="0"
                  step="0.01"
                  value={edit.unitPrice}
                  onChange={(e) =>
                    setEdit((x) => ({ ...x, unitPrice: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--neo-muted)]">Description</span>
                <textarea
                  className="neo-input mt-1 min-h-[88px]"
                  value={edit.description}
                  onChange={(e) =>
                    setEdit((x) => ({ ...x, description: e.target.value }))
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={edit.isActive}
                  onChange={(e) =>
                    setEdit((x) => ({ ...x, isActive: e.target.checked }))
                  }
                />
                Active in catalogue
              </label>
              <button className="neo-btn neo-btn-primary w-full" type="submit">
                Save product
              </button>
            </form>
          ) : (
            <p className="text-[var(--neo-muted)]">Select a product to edit.</p>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
