"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SaveBadge } from "@/components/SaveBadge";
import { QuickCreateModal } from "@/components/QuickCreateModal";
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
  company_id?: string | null;
};

type Related = {
  company: { id: string; name: string; domain: string | null } | null;
  contact: { id: string; full_name: string; email: string | null } | null;
  siblingLeads: Array<{ id: string; full_name: string; job_title: string | null; status: string }>;
};

function LeadsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [draft, setDraft] = useState<Partial<Lead>>({});
  const [related, setRelated] = useState<Related | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [converting, setConverting] = useState(false);

  async function load(query = q) {
    const data = await api<{ leads: Lead[] }>(
      `/api/leads?q=${encodeURIComponent(query)}`,
    );
    setLeads(data.leads);
    const openId = search.get("open");
    if (openId) {
      const found = data.leads.find((l) => l.id === openId);
      if (found) void openLead(found);
    }
  }

  async function openLead(lead: Lead) {
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
    const rel = await api<Related>(`/api/leads/${lead.id}/related`);
    setRelated(rel);
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

  async function convertToContact() {
    if (!selected) return;
    setConverting(true);
    try {
      const res = await api<{ contact: { id: string } }>(
        `/api/leads/${selected.id}/convert`,
        { method: "POST", body: JSON.stringify({}) },
      );
      router.push(`/contacts?open=${res.contact.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Convert failed");
    } finally {
      setConverting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl">Leads</h1>
          <p className="mt-1 text-[var(--neo-muted)]">
            Capture stage. Progress to a contact when you have outreach details.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SaveBadge status={status} error={error} />
          <button className="neo-btn neo-btn-primary" onClick={() => setShowCreate(true)}>
            Add lead
          </button>
        </div>
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
                  onClick={() => void openLead(lead)}
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
              <p className="break-all text-xs text-[var(--neo-muted)]">{selected.linkedin_uid}</p>
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
                    onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  />
                </label>
              ))}

              <button
                className="neo-btn neo-btn-primary w-full"
                disabled={converting || selected.status === "converted"}
                onClick={() => void convertToContact()}
              >
                {selected.status === "converted"
                  ? "Already converted"
                  : converting
                    ? "Converting…"
                    : "Progress to contact"}
              </button>

              <div className="neo-inset space-y-2 p-3 text-sm">
                <p className="font-medium">Related</p>
                {related?.company ? (
                  <p>
                    Company:{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => router.push("/companies")}
                    >
                      {related.company.name}
                    </button>
                    {related.company.domain ? ` · ${related.company.domain}` : ""}
                  </p>
                ) : (
                  <p className="text-[var(--neo-muted)]">No company object linked.</p>
                )}
                {related?.contact ? (
                  <p>
                    Contact:{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => router.push(`/contacts?open=${related.contact!.id}`)}
                    >
                      {related.contact.full_name}
                    </button>
                    {related.contact.email ? ` · ${related.contact.email}` : ""}
                  </p>
                ) : (
                  <p className="text-[var(--neo-muted)]">No contact yet — progress this lead.</p>
                )}
                {!!related?.siblingLeads?.length && (
                  <div>
                    <p className="mt-2 text-[var(--neo-muted)]">Same company</p>
                    <ul className="mt-1 space-y-1">
                      {related.siblingLeads.map((s) => (
                        <li key={s.id}>
                          <button
                            type="button"
                            className="underline"
                            onClick={() => router.push(`/leads?open=${s.id}`)}
                          >
                            {s.full_name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[var(--neo-muted)]">Select a lead to edit. Changes autosave.</p>
          )}
        </aside>
      </div>

      {showCreate && (
        <QuickCreateModal
          kind="lead"
          onClose={() => setShowCreate(false)}
          onCreated={() => void load(q)}
        />
      )}
    </>
  );
}

export default function LeadsPage() {
  return (
    <AppShell>
      <Suspense fallback={<p className="text-[var(--neo-muted)]">Loading leads…</p>}>
        <LeadsInner />
      </Suspense>
    </AppShell>
  );
}
