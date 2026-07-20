"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/client-api";

type Stage = { id: string; name: string; sort_order: number };

export function CreateOpportunityModal({
  open,
  onClose,
  onCreated,
  contactId,
  companyId,
  defaultName,
  contextLabel,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (opportunityId: string) => void;
  contactId?: string | null;
  companyId?: string | null;
  defaultName?: string;
  contextLabel?: string;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [stageId, setStageId] = useState("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(defaultName || "");
    setAmount("");
    setError(null);
    void api<{ stages: Stage[] }>("/api/pipeline-stages?pipeline=opportunity")
      .then((res) => {
        const list = (res.stages || []).slice().sort((a, b) => a.sort_order - b.sort_order);
        setStages(list);
        setStageId(list[0]?.id || "");
      })
      .catch(() => setStages([]));
  }, [open, defaultName]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ opportunity: { id: string } }>("/api/opportunities", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          contactId: contactId || null,
          companyId: companyId || null,
          stageId: stageId || null,
          amount: amount.trim() ? Number(amount) : null,
        }),
      });
      onCreated?.(res.opportunity.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create opportunity");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/35 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        onSubmit={onSubmit}
        className="relative z-10 w-full max-w-lg border border-[var(--line)] bg-white p-5 fade-up"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-opp-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="create-opp-title" className="display text-2xl">
              New opportunity
            </h2>
            {contextLabel ? (
              <p className="mt-1 text-sm text-[var(--neo-muted)]">{contextLabel}</p>
            ) : null}
          </div>
          <button type="button" className="neo-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="text-sm">
            <span className="text-[var(--neo-muted)]">Opportunity name</span>
            <input
              className="neo-input mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              autoFocus
            />
          </label>
          <label className="text-sm">
            <span className="text-[var(--neo-muted)]">Pipeline stage</span>
            <select
              className="neo-input mt-1"
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-[var(--neo-muted)]">Amount (optional)</span>
            <input
              className="neo-input mt-1"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
        </div>

        {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="neo-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="neo-btn neo-btn-primary"
            disabled={loading || !name.trim()}
          >
            {loading ? "Creating…" : "Create opportunity"}
          </button>
        </div>
      </form>
    </div>
  );
}
