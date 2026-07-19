"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/client-api";

type Company = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  website: string | null;
  location: string | null;
  lead_count: number;
  contact_count: number;
};

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const data = await api<{ companies: Company[] }>("/api/companies");
    setCompanies(data.companies);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const res = await api<{ created: boolean; company: Company }>("/api/companies", {
      method: "POST",
      body: JSON.stringify({ name, website, industry }),
    });
    setMessage(res.created ? "Company created" : "Matched existing company (duplicate detection)");
    setName("");
    setWebsite("");
    setIndustry("");
    await load();
  }

  return (
    <AppShell>
      <h1 className="display text-3xl">Companies</h1>
      <p className="mt-1 text-[var(--neo-muted)]">
        Company objects are shared by leads and contacts with domain/name dedupe.
      </p>

      <form onSubmit={onCreate} className="neo-raised mt-5 grid gap-3 p-4 md:grid-cols-4">
        <input className="neo-input" placeholder="Company name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="neo-input" placeholder="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <input className="neo-input" placeholder="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)} />
        <button className="neo-btn neo-btn-primary">Save company</button>
      </form>
      {message && <p className="mt-2 text-sm text-[var(--neo-accent)]">{message}</p>}

      <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {companies.map((c) => (
          <li key={c.id} className="neo-raised p-4">
            <p className="display text-xl">{c.name}</p>
            <p className="mt-1 text-sm text-[var(--neo-muted)]">
              {[c.domain, c.industry, c.location].filter(Boolean).join(" · ") || "No extras"}
            </p>
            <p className="mt-3 text-xs text-[var(--neo-muted)]">
              {c.lead_count} leads · {c.contact_count} contacts
            </p>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
