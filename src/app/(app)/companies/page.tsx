"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SaveBadge } from "@/components/SaveBadge";
import { useDynamicSave } from "@/hooks/useDynamicSave";
import { api } from "@/lib/client-api";

type Company = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  website: string | null;
  location: string | null;
  linkedin_url?: string | null;
  employee_count?: string | null;
  lead_count?: number | string;
  contact_count?: number | string;
  opportunity_count?: number | string;
};

type Related = {
  leads: Array<{ id: string; full_name: string; job_title: string | null; status: string }>;
  contacts: Array<{ id: string; full_name: string; email: string | null; job_title: string | null }>;
  opportunities: Array<{
    id: string;
    name: string;
    amount: number | null;
    currency: string;
    stage_name?: string | null;
    approval_status: string;
  }>;
};

type Tab = "fields" | "related";

export default function CompaniesPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Company | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("fields");
  const [draft, setDraft] = useState<Partial<Company>>({});
  const [related, setRelated] = useState<Related | null>(null);
  const [createName, setCreateName] = useState("");
  const [createWebsite, setCreateWebsite] = useState("");
  const [createIndustry, setCreateIndustry] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load(query = q) {
    const data = await api<{ companies: Company[] }>(
      `/api/companies?q=${encodeURIComponent(query)}`,
    );
    setCompanies(data.companies);
  }

  async function openCompany(company: Company) {
    setSelected(company);
    setOpen(true);
    setTab("fields");
    setDraft({
      name: company.name,
      website: company.website,
      industry: company.industry,
      location: company.location,
      linkedin_url: company.linkedin_url,
      employee_count: company.employee_count,
    });
    const detail = await api<{ company: Company; related: Related }>(
      `/api/companies/${company.id}`,
    );
    setSelected(detail.company);
    setDraft({
      name: detail.company.name,
      website: detail.company.website,
      industry: detail.company.industry,
      location: detail.company.location,
      linkedin_url: detail.company.linkedin_url,
      employee_count: detail.company.employee_count,
    });
    setRelated(detail.related);
  }

  useEffect(() => {
    void load("");
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const { status, error } = useDynamicSave(
    draft,
    async (next) => {
      if (!selected) return;
      const res = await api<{ company: Company }>(`/api/companies/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: next.name,
          website: next.website,
          industry: next.industry,
          location: next.location,
          linkedinUrl: next.linkedin_url,
          employeeCount: next.employee_count,
        }),
      });
      setSelected(res.company);
      setCompanies((prev) =>
        prev.map((c) => (c.id === res.company.id ? { ...c, ...res.company } : c)),
      );
    },
    700,
    Boolean(selected && open),
  );

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const res = await api<{ created: boolean; company: Company }>("/api/companies", {
      method: "POST",
      body: JSON.stringify({
        name: createName,
        website: createWebsite,
        industry: createIndustry,
      }),
    });
    setMessage(
      res.created ? "Company created" : "Matched existing company (duplicate detection)",
    );
    setCreateName("");
    setCreateWebsite("");
    setCreateIndustry("");
    await load(q);
    if (res.company) void openCompany(res.company);
  }

  return (
    <AppShell>
      <h1 className="display text-3xl">Companies</h1>
      <p className="mt-1 text-[var(--neo-muted)]">
        Edit accounts and see related leads, contacts, and opportunities.
      </p>

      <form
        onSubmit={onCreate}
        className="neo-raised mt-5 grid gap-3 p-4 md:grid-cols-4"
      >
        <input
          className="neo-input"
          placeholder="Company name"
          value={createName}
          onChange={(e) => setCreateName(e.target.value)}
          required
        />
        <input
          className="neo-input"
          placeholder="Website"
          value={createWebsite}
          onChange={(e) => setCreateWebsite(e.target.value)}
        />
        <input
          className="neo-input"
          placeholder="Industry"
          value={createIndustry}
          onChange={(e) => setCreateIndustry(e.target.value)}
        />
        <button className="neo-btn neo-btn-primary" type="submit">
          Add company
        </button>
      </form>
      {message ? (
        <p className="mt-2 text-sm text-[var(--accent-deep)]">{message}</p>
      ) : null}

      <section className="neo-raised mt-5 p-4">
        <input
          className="neo-input"
          placeholder="Search companies…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <ul className="mt-4 max-h-[65vh] space-y-2 overflow-auto">
          {companies.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`w-full rounded-2xl p-3 text-left ${
                  selected?.id === c.id && open ? "neo-pressed" : "neo-inset"
                }`}
                onClick={() => void openCompany(c)}
              >
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-[var(--neo-muted)]">
                  {[c.domain, c.industry, c.location].filter(Boolean).join(" · ") ||
                    "No extras"}
                </p>
                <p className="mt-1 text-xs text-[var(--neo-muted)]">
                  {Number(c.lead_count || 0)} leads · {Number(c.contact_count || 0)}{" "}
                  contacts · {Number(c.opportunity_count || 0)} opportunities
                </p>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div
        className={`record-drawer-backdrop ${open ? "is-open" : ""}`}
        onClick={() => setOpen(false)}
      />
      <aside
        className={`record-drawer ${open ? "is-open" : ""}`}
        role="dialog"
        aria-label="Company record"
      >
        {selected ? (
          <div className="flex h-full flex-col">
            <header className="record-drawer-header">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="page-kicker">Company</p>
                  <h2 className="display text-2xl">{draft.name || selected.name}</h2>
                  <p className="mt-1 text-sm text-[var(--neo-muted)]">
                    {selected.domain || "No domain"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <SaveBadge status={status} error={error} />
                  <button type="button" className="neo-btn" onClick={() => setOpen(false)}>
                    Close
                  </button>
                </div>
              </div>
              <nav className="record-tabs" aria-label="Company sections">
                <button
                  type="button"
                  className={`record-tab ${tab === "fields" ? "is-active" : ""}`}
                  onClick={() => setTab("fields")}
                >
                  About
                </button>
                <button
                  type="button"
                  className={`record-tab ${tab === "related" ? "is-active" : ""}`}
                  onClick={() => setTab("related")}
                >
                  Related
                </button>
              </nav>
            </header>
            <div className="record-drawer-body">
              {tab === "fields" && (
                <div className="grid gap-3">
                  {(
                    [
                      ["name", "Name"],
                      ["website", "Website"],
                      ["industry", "Industry"],
                      ["location", "Location"],
                      ["linkedin_url", "LinkedIn URL"],
                      ["employee_count", "Employee count"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block text-sm">
                      <span className="text-[var(--neo-muted)]">{label}</span>
                      <input
                        className="neo-input mt-1"
                        value={(draft[key] as string) || ""}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [key]: e.target.value }))
                        }
                      />
                    </label>
                  ))}
                </div>
              )}
              {tab === "related" && (
                <div className="space-y-5 text-sm">
                  <section>
                    <h3 className="record-section-title">Opportunities</h3>
                    {related?.opportunities?.length ? (
                      <ul className="mt-2 space-y-2">
                        {related.opportunities.map((o) => (
                          <li key={o.id}>
                            <button
                              type="button"
                              className="record-link-row"
                              onClick={() =>
                                router.push(`/opportunities?open=${o.id}`)
                              }
                            >
                              <span className="font-medium">{o.name}</span>
                              <span className="text-[var(--neo-muted)]">
                                {[o.stage_name, o.approval_status]
                                  .filter(Boolean)
                                  .join(" · ")}
                                {o.amount != null
                                  ? ` · ${o.currency} ${o.amount}`
                                  : ""}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[var(--neo-muted)]">No opportunities.</p>
                    )}
                  </section>
                  <section>
                    <h3 className="record-section-title">Contacts</h3>
                    {related?.contacts?.length ? (
                      <ul className="mt-2 space-y-1">
                        {related.contacts.map((c) => (
                          <li key={c.id}>
                            <button
                              type="button"
                              className="underline"
                              onClick={() => router.push(`/contacts?open=${c.id}`)}
                            >
                              {c.full_name}
                              {c.email ? ` · ${c.email}` : ""}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[var(--neo-muted)]">No contacts.</p>
                    )}
                  </section>
                  <section>
                    <h3 className="record-section-title">Leads</h3>
                    {related?.leads?.length ? (
                      <ul className="mt-2 space-y-1">
                        {related.leads.map((l) => (
                          <li key={l.id}>
                            <button
                              type="button"
                              className="underline"
                              onClick={() => router.push(`/leads?open=${l.id}`)}
                            >
                              {l.full_name}
                              {l.job_title ? ` · ${l.job_title}` : ""} · {l.status}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-[var(--neo-muted)]">No leads.</p>
                    )}
                  </section>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </aside>
    </AppShell>
  );
}
