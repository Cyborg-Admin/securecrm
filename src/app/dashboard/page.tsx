"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { ClientOnly } from "@/components/ClientOnly";
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

type ReportsLite = {
  captureByDay: Array<{ day: string; leads: number }>;
  conversion: { rate: number; converted: number; leads: number };
};

export default function DashboardPage() {
  const [data, setData] = useState<Dash | null>(null);
  const [reports, setReports] = useState<ReportsLite | null>(null);

  useEffect(() => {
    api<Dash>("/api/dashboard").then(setData).catch(() => setData(null));
    api<ReportsLite>("/api/reports").then(setReports).catch(() => setReports(null));
  }, []);

  const cards = [
    { label: "Leads", value: data?.stats.leads ?? "—", href: "/leads" },
    { label: "My leads", value: data?.stats.myLeads ?? "—", href: "/leads" },
    { label: "Contacts", value: data?.stats.contacts ?? "—", href: "/contacts" },
    { label: "Companies", value: data?.stats.companies ?? "—", href: "/companies" },
  ];

  return (
    <AppShell>
      <div className="fade-up flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="page-kicker">Overview</p>
          <h1 className="display mt-1 text-3xl md:text-4xl">Command center</h1>
          <p className="mt-2 max-w-2xl text-[var(--neo-muted)]">
            Capture momentum, ownership, and accountability in one place.
          </p>
        </div>
        <Link href="/reports" className="neo-btn neo-btn-primary">
          Open reports
        </Link>
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="neo-raised block p-5 transition hover:-translate-y-0.5">
            <p className="text-sm text-[var(--neo-muted)]">{c.label}</p>
            <p className="stat-value mt-2 text-[var(--accent-deep)]">{c.value}</p>
          </Link>
        ))}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="neo-raised p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="display text-xl">Capture trend</h2>
            <span className="text-xs text-[var(--neo-muted)]">
              {reports ? `${reports.conversion.rate}% converted` : "—"}
            </span>
          </div>
          <div className="mt-4 h-56">
            <ClientOnly
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-[var(--neo-muted)]">
                  Loading chart…
                </div>
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={reports?.captureByDay || []}>
                  <defs>
                    <linearGradient id="dashFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0d7a5f" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#0d7a5f" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" hide />
                  <YAxis hide allowDecimals={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="leads"
                    stroke="#0d7a5f"
                    fill="url(#dashFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ClientOnly>
          </div>
        </div>

        <div className="neo-raised p-5">
          <h2 className="display text-xl">Accountability</h2>
          <ul className="mt-4 space-y-2">
            {(data?.recentAudit || []).slice(0, 6).map((a) => (
              <li key={a.id} className="neo-inset p-3 text-sm">
                <p className="font-medium">{a.action}</p>
                <p className="text-[var(--neo-muted)]">
                  {a.entity_type || "system"} ·{" "}
                  {a.created_at?.slice(0, 19).replace("T", " ") || "—"}
                </p>
              </li>
            ))}
            {!data?.recentAudit?.length && (
              <li className="text-sm text-[var(--neo-muted)]">No audit events yet.</li>
            )}
          </ul>
        </div>
      </section>

      <section className="neo-raised mt-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="display text-xl">Recent leads</h2>
          <Link href="/leads" className="text-sm text-[var(--accent-deep)] underline">
            View all
          </Link>
        </div>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {(data?.recentLeads || []).map((l) => (
            <li key={l.id} className="neo-inset p-3">
              <p className="font-medium">{l.full_name}</p>
              <p className="text-sm text-[var(--neo-muted)]">
                {[l.job_title, l.company_name].filter(Boolean).join(" · ") || "No title"}
                {" · "}
                {l.source} · {l.status}
              </p>
            </li>
          ))}
          {!data?.recentLeads?.length && (
            <li className="text-sm text-[var(--neo-muted)]">
              No leads yet — use the Chrome extension or FAB to add one.
            </li>
          )}
        </ul>
      </section>
    </AppShell>
  );
}
