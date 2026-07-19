"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/client-api";

type Reports = {
  leadsByStatus: Array<{ name: string; value: number }>;
  leadsBySource: Array<{ name: string; value: number }>;
  leadsByOwner: Array<{ name: string; value: number }>;
  captureByDay: Array<{ day: string; leads: number }>;
  topCompanies: Array<{ name: string; value: number }>;
  conversion: {
    leads: number;
    converted: number;
    contacts: number;
    companies: number;
    rate: number;
  };
};

const COLORS = ["#0d7a5f", "#0e7490", "#b45309", "#475569", "#047857", "#155e75", "#92400e"];

export default function ReportsPage() {
  const [data, setData] = useState<Reports | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Reports>("/api/reports")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  return (
    <AppShell>
      <div className="fade-up">
        <p className="page-kicker">Analytics</p>
        <h1 className="display mt-1 text-3xl md:text-4xl">Reports</h1>
        <p className="mt-2 max-w-2xl text-[var(--neo-muted)]">
          Pipeline health, capture trends, ownership load, and conversion.
        </p>
      </div>

      {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Total leads", value: data?.conversion.leads ?? "—" },
          { label: "Converted", value: data?.conversion.converted ?? "—" },
          { label: "Conversion rate", value: data ? `${data.conversion.rate}%` : "—" },
          { label: "Contacts", value: data?.conversion.contacts ?? "—" },
        ].map((card) => (
          <div key={card.label} className="neo-raised p-5">
            <p className="text-sm text-[var(--neo-muted)]">{card.label}</p>
            <p className="stat-value mt-2 text-[var(--accent-deep)]">{card.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="neo-raised p-5">
          <h2 className="display text-xl">Lead capture (14 days)</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.captureByDay || []}>
                <defs>
                  <linearGradient id="leadFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0d7a5f" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0d7a5f" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(20,32,28,0.08)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#5f7169" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#5f7169" }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="leads"
                  stroke="#0d7a5f"
                  fill="url(#leadFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="neo-raised p-5">
          <h2 className="display text-xl">By source</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data?.leadsBySource || []}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                >
                  {(data?.leadsBySource || []).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="neo-raised p-5">
          <h2 className="display text-xl">By status</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.leadsByStatus || []}>
                <CartesianGrid stroke="rgba(20,32,28,0.08)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#5f7169" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#5f7169" }} />
                <Tooltip />
                <Bar dataKey="value" fill="#0e7490" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="neo-raised p-5">
          <h2 className="display text-xl">Ownership load</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.leadsByOwner || []} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid stroke="rgba(20,32,28,0.08)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#5f7169" }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  tick={{ fontSize: 11, fill: "#5f7169" }}
                />
                <Tooltip />
                <Bar dataKey="value" fill="#b45309" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="neo-raised mt-4 p-5">
        <h2 className="display text-xl">Top companies in pipeline</h2>
        <div className="mt-4 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.topCompanies || []}>
              <CartesianGrid stroke="rgba(20,32,28,0.08)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#5f7169" }} interval={0} angle={-18} textAnchor="end" height={70} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#5f7169" }} />
              <Tooltip />
              <Bar dataKey="value" fill="#0d7a5f" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </AppShell>
  );
}
