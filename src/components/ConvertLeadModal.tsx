"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/client-api";

export function ConvertLeadModal({
  open,
  leadId,
  leadName,
  companyName,
  defaultEmail,
  onClose,
  onConverted,
}: {
  open: boolean;
  leadId: string;
  leadName: string;
  companyName?: string | null;
  defaultEmail?: string | null;
  onClose: () => void;
  onConverted: (result: {
    contactId: string;
    opportunityId?: string | null;
  }) => void;
}) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [alsoOpportunity, setAlsoOpportunity] = useState(false);
  const [opportunityName, setOpportunityName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(defaultEmail || "");
    setPhone("");
    setAlsoOpportunity(false);
    setOpportunityName(
      companyName
        ? `${leadName} · ${companyName}`
        : `${leadName} opportunity`,
    );
    setError(null);
  }, [open, defaultEmail, leadName, companyName]);

  if (!open) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<{
        contact: { id: string; company_id?: string | null };
      }>(`/api/leads/${leadId}/convert`, {
        method: "POST",
        body: JSON.stringify({
          email: email.trim() || null,
          phone: phone.trim() || null,
        }),
      });

      let opportunityId: string | null = null;
      if (alsoOpportunity && opportunityName.trim()) {
        const opp = await api<{ opportunity: { id: string } }>(
          "/api/opportunities",
          {
            method: "POST",
            body: JSON.stringify({
              name: opportunityName.trim(),
              contactId: res.contact.id,
              companyId: res.contact.company_id || null,
            }),
          },
        );
        opportunityId = opp.opportunity.id;
      }

      onConverted({ contactId: res.contact.id, opportunityId });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed");
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
        aria-labelledby="convert-lead-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="convert-lead-title" className="display text-2xl">
              Convert to contact
            </h2>
            <p className="mt-1 text-sm text-[var(--neo-muted)]">{leadName}</p>
          </div>
          <button type="button" className="neo-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-[#b7d8cb] bg-[var(--accent-soft)] p-3 text-sm">
          <p className="font-medium">Final pipeline stage</p>
          <p className="mt-1 text-[var(--neo-muted)]">
            This marks the lead as Converted and creates a contact record you can
            work with for email, phone, and opportunities.
          </p>
        </div>

        <div className="mt-4 grid gap-3">
          <label className="text-sm">
            <span className="text-[var(--neo-muted)]">Email (optional)</span>
            <input
              className="neo-input mt-1"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </label>
          <label className="text-sm">
            <span className="text-[var(--neo-muted)]">Phone (optional)</span>
            <input
              className="neo-input mt-1"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+44…"
            />
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={alsoOpportunity}
              onChange={(e) => setAlsoOpportunity(e.target.checked)}
            />
            <span>
              Also create an opportunity
              <span className="mt-0.5 block text-[var(--neo-muted)]">
                Useful when this lead is already a deal in progress.
              </span>
            </span>
          </label>

          {alsoOpportunity ? (
            <label className="text-sm">
              <span className="text-[var(--neo-muted)]">Opportunity name</span>
              <input
                className="neo-input mt-1"
                value={opportunityName}
                onChange={(e) => setOpportunityName(e.target.value)}
                required={alsoOpportunity}
              />
            </label>
          ) : null}
        </div>

        {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="neo-btn" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="neo-btn neo-btn-primary" disabled={loading}>
            {loading ? "Converting…" : "Convert to contact"}
          </button>
        </div>
      </form>
    </div>
  );
}
