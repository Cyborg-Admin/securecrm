"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/client-api";

type Automation = {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  is_active: number;
  run_count: number;
  actions_json: string;
};

export default function AutomationsPage() {
  const [items, setItems] = useState<Automation[]>([]);

  useEffect(() => {
    api<{ automations: Automation[] }>("/api/automations")
      .then((d) => setItems(d.automations))
      .catch(() => setItems([]));
  }, []);

  return (
    <AppShell>
      <h1 className="display text-3xl">Automations</h1>
      <p className="mt-1 text-[var(--neo-muted)]">
        Triggered workflows at the core — capture, ownership, and status changes.
      </p>

      <ul className="mt-6 grid gap-4 lg:grid-cols-2">
        {items.map((a) => (
          <li key={a.id} className="neo-raised p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="display text-2xl">{a.name}</p>
                <p className="mt-1 text-sm text-[var(--neo-muted)]">{a.description}</p>
              </div>
              <span className="neo-inset px-3 py-1 text-xs">
                {a.is_active ? "Active" : "Paused"}
              </span>
            </div>
            <p className="mt-4 text-sm">
              Trigger: <strong>{a.trigger_type}</strong>
            </p>
            <pre className="neo-inset mt-3 overflow-auto p-3 text-xs">
              {JSON.stringify(
                typeof a.actions_json === "string"
                  ? JSON.parse(a.actions_json || "[]")
                  : a.actions_json || [],
                null,
                2,
              )}
            </pre>
            <p className="mt-3 text-xs text-[var(--neo-muted)]">{a.run_count} runs</p>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
