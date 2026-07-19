"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/client-api";

type KeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type RecipeRow = {
  id: string;
  source: string;
  version: number;
  is_active: boolean | number;
  fields: Record<string, unknown>;
  updated_at: string;
};

export default function SettingsPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [name, setName] = useState("Chrome Extension");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeRow[]>([]);
  const [recipeSource, setRecipeSource] = useState("linkedin");
  const [recipeJson, setRecipeJson] = useState("{}");
  const [recipeStatus, setRecipeStatus] = useState<string | null>(null);

  async function load() {
    const data = await api<{ keys: KeyRow[] }>("/api/settings/api-keys");
    setKeys(data.keys);
  }

  async function loadRecipes(source = recipeSource) {
    const data = await api<{ recipes: RecipeRow[] }>(
      `/api/scrape-recipes?source=${encodeURIComponent(source)}`,
    );
    setRecipes(data.recipes);
    const active = data.recipes.find((r) => r.is_active === true || r.is_active === 1);
    setRecipeJson(JSON.stringify(active?.fields || {}, null, 2));
  }

  useEffect(() => {
    void load();
    void loadRecipes("linkedin");
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const res = await api<{ apiKey: string }>("/api/settings/api-keys", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setCreatedKey(res.apiKey);
    await load();
  }

  async function saveRecipe() {
    setRecipeStatus(null);
    try {
      const fields = JSON.parse(recipeJson) as Record<string, unknown>;
      await api("/api/scrape-recipes", {
        method: "PUT",
        body: JSON.stringify({ source: recipeSource, fields }),
      });
      setRecipeStatus("Saved as new active version.");
      await loadRecipes(recipeSource);
    } catch (e) {
      setRecipeStatus(e instanceof Error ? e.message : "Save failed");
    }
  }

  async function activateRecipe(id: string) {
    await api("/api/scrape-recipes", {
      method: "PUT",
      body: JSON.stringify({ recipeId: id }),
    });
    await loadRecipes(recipeSource);
  }

  return (
    <AppShell>
      <h1 className="display text-3xl">Settings</h1>
      <p className="mt-1 text-[var(--neo-muted)]">
        Extension API keys, scrape recipes, and workspace security.
      </p>

      <section className="neo-raised mt-5 p-5">
        <h2 className="display text-xl">Chrome extension</h2>
        <p className="mt-1 text-sm text-[var(--neo-muted)]">
          Generate a key, then paste it in the extension side panel (toolbar icon).
          Keys are hashed at rest. Download the latest packaged build anytime:
        </p>
        <p className="mt-3">
          <a className="neo-btn neo-btn-primary inline-block" href="/api/extension/download">
            Download extension zip
          </a>
          <span className="ml-3 text-xs text-[var(--neo-muted)]">
            Current package reports version via{" "}
            <a className="underline" href="/api/extension/version">
              /api/extension/version
            </a>
          </span>
        </p>
        <form onSubmit={onCreate} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input className="neo-input" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="neo-btn neo-btn-primary">Generate key</button>
        </form>
        {createdKey && (
          <div className="neo-inset mt-4 break-all p-3 text-sm">
            <p className="font-medium text-[var(--neo-accent)]">Copy now — shown once</p>
            <code>{createdKey}</code>
          </div>
        )}
        <ul className="mt-4 space-y-2">
          {keys.map((k) => (
            <li key={k.id} className="neo-inset flex justify-between gap-3 p-3 text-sm">
              <span>{k.name} · {k.key_prefix}…</span>
              <span className="text-[var(--neo-muted)]">
                {k.revoked_at ? "Revoked" : "Active"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="neo-raised mt-4 p-5">
        <h2 className="display text-xl">Scrape recipes</h2>
        <p className="mt-1 text-sm text-[var(--neo-muted)]">
          Owner-trainable field maps for the Chrome extension. Prefer Train mode on
          LinkedIn; edit JSON here for advanced tweaks.
        </p>
        <label className="mt-4 block text-sm text-[var(--neo-muted)]">
          Source
          <select
            className="neo-input mt-1"
            value={recipeSource}
            onChange={(e) => {
              const s = e.target.value;
              setRecipeSource(s);
              void loadRecipes(s);
            }}
          >
            <option value="linkedin">LinkedIn</option>
            <option value="salesnav">Sales Navigator</option>
            <option value="cognism">Cognism</option>
            <option value="gmail">Gmail</option>
          </select>
        </label>
        <textarea
          className="neo-input mt-3 min-h-48 font-mono text-xs"
          value={recipeJson}
          onChange={(e) => setRecipeJson(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="neo-btn neo-btn-primary" onClick={() => void saveRecipe()}>
            Save as active version
          </button>
        </div>
        {recipeStatus && (
          <p className="mt-2 text-sm text-[var(--accent-deep)]">{recipeStatus}</p>
        )}
        <ul className="mt-4 space-y-2 text-sm">
          {recipes.map((r) => (
            <li key={r.id} className="neo-inset flex items-center justify-between gap-3 p-3">
              <span>
                v{r.version}
                {(r.is_active === true || r.is_active === 1) && (
                  <span className="ml-2 text-[var(--accent-deep)]">active</span>
                )}
                <span className="ml-2 text-[var(--neo-muted)]">
                  {String(r.updated_at).slice(0, 19).replace("T", " ")}
                </span>
              </span>
              {!(r.is_active === true || r.is_active === 1) && (
                <button
                  type="button"
                  className="neo-btn text-xs"
                  onClick={() => void activateRecipe(r.id)}
                >
                  Activate
                </button>
              )}
            </li>
          ))}
          {!recipes.length && (
            <li className="text-[var(--neo-muted)]">No versions yet — train on LinkedIn or paste JSON.</li>
          )}
        </ul>
      </section>

      <section className="neo-raised mt-4 p-5 text-sm text-[var(--neo-muted)]">
        <h2 className="display text-xl text-[var(--neo-text)]">Database</h2>
        <p className="mt-2">
          Local default: SQLite at <code>data/securecrm.sqlite</code> from{" "}
          <code>database/schema.sql</code>.
        </p>
        <p className="mt-2">
          PostgreSQL: run <code>database/postgres/setup.sql</code>, then set{" "}
          <code>DB_DRIVER=postgres</code> and <code>DATABASE_URL</code>.
        </p>
      </section>
    </AppShell>
  );
}
