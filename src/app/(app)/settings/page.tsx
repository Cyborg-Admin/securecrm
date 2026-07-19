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

export default function SettingsPage() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [name, setName] = useState("Chrome Extension");
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  async function load() {
    const data = await api<{ keys: KeyRow[] }>("/api/settings/api-keys");
    setKeys(data.keys);
  }

  useEffect(() => {
    void load();
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

  return (
    <AppShell>
      <h1 className="display text-3xl">Settings</h1>
      <p className="mt-1 text-[var(--neo-muted)]">
        Extension API keys and workspace security controls.
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
