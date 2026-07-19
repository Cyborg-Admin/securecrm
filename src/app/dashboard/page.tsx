"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/client-api";

type Dash = {
  stats: Record<string, number>;
  recentLeads: Array<{
    id: string;
    full_name: string;
    job_title: string | null;
    company_name: string | null;
    source: string;
    status: string;
  }>;
  recentAudit: Array<{
    id: string;
    action: string;
    entity_type: string | null;
    created_at: string;
  }>;
};

export default function DashboardPage() {
  const [data, setData] = useState<Dash | null>(null);

  useEffect(() => {
    api<Dash>("/api/dashboard").then(setData).catch(() => setData(null));
  }, []);

  const cards = [
    { label: "Leads", value: data?.stats.leads ?? "—" },
    { label: "My leads", value: data?.stats.myLeads ?? "—" },
    { label: "Companies", value: data?.stats.companies ?? "—" },
    { label: "Automations", value: data?.stats.automations ?? "—" },
  ];

  return (
    <AppShell>
      <div className="fade-up">
        <h1 className="display text-3xl md:text-4xl">Command center</h1>
        <p className="mt-2 max-w-2xl text-[var(--neo-muted)]">
          Ownership, auditability, and capture automation in one soft workspace.
        </p>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="neo-raised p-5 fade-up">
            <p className="text-sm text-[var(--neo-muted)]">{c.label}</p>
            <p className="display mt-2 text-3xl">{c.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="neo-raised p-5">
          <h2 className="display text-xl">Recent leads</h2>
          <ul className="mt-4 space-y-3">
            {(data?.recentLeads || []).map((l) => (
              <li key={l.id} className="neo-inset p-3">
                <p className="font-medium">{l.full_name}</p>
                <p className="text-sm text-[var(--neo-muted)]">
                  {[l.job_title, l.company_name].filter(Boolean).join(" · ") || "No title"}
                  {" · "}
                  {l.source}
                </p>
              </li>
            ))}
            {!data?.recentLeads?.length && (
              <li className="text-sm text-[var(--neo-muted)]">No leads yet — use the Chrome extension.</li>
            )}
          </ul>
        </div>

        <div className="neo-raised p-5">
          <h2 className="display text-xl">Accountability feed</h2>
          <ul className="mt-4 space-y-3">
            {(data?.recentAudit || []).map((a) => (
              <li key={a.id} className="neo-inset p-3 text-sm">
                <p className="font-medium">{a.action}</p>
                <p className="text-[var(--neo-muted)]">
                  {a.entity_type || "system"} · {new Date(a.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </AppShell>
  );
}
