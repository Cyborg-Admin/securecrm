"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/client-api";

type Opp = {
  id: string;
  name: string;
  company_id: string | null;
  contact_id: string | null;
  company_name?: string | null;
  contact_name?: string | null;
  stage_id: string | null;
  stage_name?: string | null;
  amount: number | null;
  currency: string;
  approval_status: string;
  owner_name?: string | null;
};

type Stage = { id: string; name: string; requires_approval: number | boolean };
type Company = { id: string; name: string };
type Contact = { id: string; full_name: string };

function OpportunitiesInner() {
  const search = useSearchParams();
  const [opps, setOpps] = useState<Opp[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Opp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    companyId: "",
    contactId: "",
    stageId: "",
    amount: "",
  });

  async function load() {
    const [o, s, c, ct] = await Promise.all([
      api<{ opportunities: Opp[] }>("/api/opportunities"),
      api<{ stages: Stage[] }>("/api/pipeline-stages?pipeline=opportunity"),
      api<{ companies: Company[] }>("/api/companies"),
      api<{ contacts: Contact[] }>("/api/contacts"),
    ]);
    setOpps(o.opportunities);
    setStages(s.stages);
    setCompanies(c.companies || []);
    setContacts(ct.contacts || []);
    const openId = search.get("open");
    if (openId) {
      const found = o.opportunities.find((x) => x.id === openId);
      if (found) setSelected(found);
    }
  }

  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/opportunities", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          companyId: form.companyId || null,
          contactId: form.contactId || null,
          stageId: form.stageId || null,
          amount: form.amount ? Number(form.amount) : null,
        }),
      });
      setForm({ name: "", companyId: "", contactId: "", stageId: "", amount: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function moveStage(stageId: string) {
    if (!selected) return;
    const res = await api<{ opportunity: Opp }>(`/api/opportunities/${selected.id}`, {
      method: "PATCH",
      body: JSON.stringify({ stageId }),
    });
    setSelected(res.opportunity);
    await load();
  }

  async function decide(decision: "approved" | "rejected") {
    if (!selected) return;
    await api(`/api/opportunities/${selected.id}/approve`, {
      method: "POST",
      body: JSON.stringify({ decision }),
    });
    await load();
    const fresh = await api<{ opportunity: Opp }>(
      `/api/opportunities/${selected.id}`,
    );
    setSelected(fresh.opportunity);
  }

  return (
    <>
      <h1 className="display text-3xl">Opportunities</h1>
      <p className="mt-1 text-[var(--neo-muted)]">
        Track deals against companies and contacts. Stages can require admin approval.
      </p>
      {error ? (
        <p className="mt-2 text-sm text-[var(--neo-danger)]">{error}</p>
      ) : null}

      <form
        onSubmit={create}
        className="neo-raised mt-5 grid gap-3 p-4 md:grid-cols-2"
      >
        <input
          className="neo-input md:col-span-2"
          placeholder="Opportunity name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
        <select
          className="neo-input"
          value={form.companyId}
          onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value }))}
        >
          <option value="">Company (optional)</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="neo-input"
          value={form.contactId}
          onChange={(e) => setForm((f) => ({ ...f, contactId: e.target.value }))}
        >
          <option value="">Contact (optional)</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
        <select
          className="neo-input"
          value={form.stageId}
          onChange={(e) => setForm((f) => ({ ...f, stageId: e.target.value }))}
        >
          <option value="">Default first stage</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          className="neo-input"
          type="number"
          placeholder="Amount"
          value={form.amount}
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
        />
        <button className="neo-btn neo-btn-primary md:col-span-2" type="submit">
          Create opportunity
        </button>
      </form>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <ul className="neo-raised max-h-[65vh] space-y-2 overflow-auto p-3">
          {opps.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                className={`w-full rounded-2xl p-3 text-left ${
                  selected?.id === o.id ? "neo-pressed" : "neo-inset"
                }`}
                onClick={() => setSelected(o)}
              >
                <p className="font-medium">{o.name}</p>
                <p className="text-sm text-[var(--neo-muted)]">
                  {[o.company_name, o.contact_name, o.stage_name]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                <p className="mt-1 text-xs text-[var(--neo-muted)]">
                  {o.approval_status !== "none"
                    ? `Approval: ${o.approval_status}`
                    : "No approval"}
                  {o.amount != null
                    ? ` · ${o.currency} ${o.amount}`
                    : ""}
                </p>
              </button>
            </li>
          ))}
        </ul>

        <aside className="neo-raised p-4">
          {selected ? (
            <div className="space-y-3">
              <h2 className="display text-2xl">{selected.name}</h2>
              <p className="text-sm text-[var(--neo-muted)]">
                {[selected.company_name, selected.contact_name]
                  .filter(Boolean)
                  .join(" · ") || "No company/contact linked"}
              </p>
              <label className="block text-sm">
                <span className="text-[var(--neo-muted)]">Pipeline stage</span>
                <select
                  className="neo-input mt-1"
                  value={selected.stage_id || ""}
                  onChange={(e) => void moveStage(e.target.value)}
                >
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.requires_approval ? " (approval)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {selected.approval_status === "pending" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="neo-btn neo-btn-primary"
                    onClick={() => void decide("approved")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="neo-btn"
                    onClick={() => void decide("rejected")}
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[var(--neo-muted)]">
                  Approval status: {selected.approval_status}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[var(--neo-muted)]">Select an opportunity.</p>
          )}
        </aside>
      </div>
    </>
  );
}

export default function OpportunitiesPage() {
  return (
    <AppShell>
      <Suspense fallback={<p className="text-[var(--neo-muted)]">Loading…</p>}>
        <OpportunitiesInner />
      </Suspense>
    </AppShell>
  );
}
