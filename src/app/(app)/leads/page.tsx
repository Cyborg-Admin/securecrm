"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { LeadRecordDrawer, type Lead } from "@/components/LeadRecordDrawer";
import {
  PipelineMiniBar,
  type PipelineStage,
} from "@/components/PipelineStepper";
import { QuickCreateModal } from "@/components/QuickCreateModal";
import { api } from "@/lib/client-api";

function LeadsInner() {
  const search = useSearchParams();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  async function load(query = q) {
    const data = await api<{ leads: Lead[] }>(
      `/api/leads?q=${encodeURIComponent(query)}`,
    );
    setLeads(data.leads);
    const openId = search.get("open");
    if (openId) {
      const found = data.leads.find((l) => l.id === openId);
      if (found) openLead(found);
    }
  }

  function openLead(lead: Lead) {
    setSelected(lead);
    setDrawerOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.set("open", lead.id);
    window.history.replaceState({}, "", url.toString());
  }

  function closeDrawer() {
    setDrawerOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("open");
    window.history.replaceState({}, "", url.toString());
  }

  useEffect(() => {
    void load("");
    void api<{ stages: PipelineStage[] }>("/api/pipeline-stages?pipeline=lead")
      .then((res) => setPipelineStages(res.stages || []))
      .catch(() => setPipelineStages([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl">Leads</h1>
          <p className="mt-1 text-[var(--neo-muted)]">
            Move leads through the pipeline. Open a record to progress stages,
            related data, roles, and activity.
          </p>
        </div>
        <button
          className="neo-btn neo-btn-primary"
          onClick={() => setShowCreate(true)}
        >
          Add lead
        </button>
      </div>

      <section className="neo-raised mt-5 p-4">
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
                  selected?.id === lead.id && drawerOpen
                    ? "neo-pressed"
                    : "neo-inset hover:opacity-95"
                }`}
                onClick={() => openLead(lead)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{lead.full_name}</p>
                    <p className="text-sm text-[var(--neo-muted)]">
                      {[lead.job_title, lead.company_name]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {pipelineStages.length ? (
                    <PipelineMiniBar
                      stages={pipelineStages}
                      currentStatus={lead.status}
                    />
                  ) : (
                    <span className="record-chip shrink-0">{lead.status}</span>
                  )}
                </div>
                <p className="mt-1 text-xs text-[var(--neo-muted)]">
                  {lead.source} · {lead.owner_name || "Unassigned"}
                </p>
              </button>
            </li>
          ))}
          {!leads.length ? (
            <li className="py-8 text-center text-sm text-[var(--neo-muted)]">
              No leads yet — capture from LinkedIn or add one manually.
            </li>
          ) : null}
        </ul>
      </section>

      <LeadRecordDrawer
        lead={selected}
        open={drawerOpen}
        onClose={closeDrawer}
        onLeadUpdated={(updated) => {
          setSelected(updated);
          setLeads((prev) =>
            prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)),
          );
        }}
        onLeadDeleted={(id) => {
          setLeads((prev) => prev.filter((l) => l.id !== id));
          setSelected(null);
        }}
      />

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
