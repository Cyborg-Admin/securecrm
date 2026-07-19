"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { SaveBadge } from "@/components/SaveBadge";
import { useDynamicSave } from "@/hooks/useDynamicSave";
import { api } from "@/lib/client-api";

type Lead = {
  id: string;
  full_name: string;
  job_title: string | null;
  company_name: string | null;
  industry: string | null;
  website: string | null;
  location: string | null;
  status: string;
  source: string;
  linkedin_uid: string;
  owner_name?: string;
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [draft, setDraft] = useState<Partial<Lead>>({});
  const [mobileDetail, setMobileDetail] = useState(false);

  async function load(query = q) {
    const data = await api<{ leads: Lead[] }>(
      `/api/leads?q=${encodeURIComponent(query)}`,
    );
    setLeads(data.leads);
  }

  useEffect(() => {
    void load("");
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  function openLead(lead: Lead) {
    setSelected(lead);
    setDraft({
      full_name: lead.full_name,
      job_title: lead.job_title,
      company_name: lead.company_name,
      industry: lead.industry,
      website: lead.website,
      location: lead.location,
      status: lead.status,
    });
    setMobileDetail(true);
  }

  const { status, error } = useDynamicSave(
    draft,
    async (next) => {
      if (!selected) return;
      const res = await api<{ lead: Lead }>(`/api/leads/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: next.full_name,
          jobTitle: next.job_title,
          companyName: next.company_name,
          industry: next.industry,
          website: next.website,
          location: next.location,
          status: next.status,
        }),
      });
      setSelected(res.lead);
      setLeads((prev) => prev.map((l) => (l.id === res.lead.id ? { ...l, ...res.lead } : l)));
    },
    700,
    Boolean(selected),
  );

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl">Leads</h1>
          <p className="mt-1 text-[var(--neo-muted)]">
            LinkedIn UID is the stable identity. Contact details come later.
          </p>
        </div>
        <SaveBadge status={status} error={error} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="neo-raised p-4">
          <input
            className="neo-input"
            placeholder="Search name, company, title…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="mt-4 max-h-[70vh] space-y-2 overflow-auto">
            {leads.map((lead) => (
              <li key={lead.id}>
                <button
                  className={`w-full rounded-2xl p-3 text-left transition ${
                    selected?.id === lead.id ? "neo-pressed" : "neo-inset hover:opacity-95"
                  }`}
                  onClick={() => openLead(lead)}
                >
                  <p className="font-medium">{lead.full_name}</p>
                  <p className="text-sm text-[var(--neo-muted)]">
                    {[lead.job_title, lead.company_name].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 text-xs text-[var(--neo-muted)]">
                    {lead.source} · {lead.status} · {lead.owner_name || "Unassigned"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <aside
          className={`neo-raised p-4 ${
            mobileDetail ? "fixed inset-x-3 bottom-3 top-16 z-30 lg:static" : "hidden lg:block"
          }`}
        >
          {selected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="display text-2xl">Lead detail</h2>
                <button className="neo-btn lg:hidden" onClick={() => setMobileDetail(false)}>
                  Close
                </button>
              </div>
              <p className="text-xs text-[var(--neo-muted)] break-all">{selected.linkedin_uid}</p>
              {(
                [
                  ["full_name", "Full name"],
                  ["job_title", "Job title"],
                  ["company_name", "Company"],
                  ["industry", "Industry"],
                  ["website", "Website"],
                  ["location", "Location"],
                  ["status", "Status"],
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
          ) : (
            <p className="text-[var(--neo-muted)]">Select a lead to edit. Changes autosave.</p>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
