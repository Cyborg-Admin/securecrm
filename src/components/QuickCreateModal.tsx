"use client";

import { FormEvent, useState } from "react";
import { api } from "@/lib/client-api";

export type QuickCreateKind = "lead" | "contact";

export function QuickCreateModal({
  kind,
  onClose,
  onCreated,
}: {
  kind: QuickCreateKind;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (kind === "lead") {
        if (!linkedinUrl.trim()) {
          throw new Error("LinkedIn URL is required for leads (UID).");
        }
        const res = await api<{ lead: { id: string } }>("/api/leads", {
          method: "POST",
          body: JSON.stringify({
            linkedinUrl,
            fullName,
            jobTitle: jobTitle || null,
            companyName: companyName || null,
            industry: industry || null,
            website: website || null,
            source: "manual",
          }),
        });
        onCreated?.(res.lead.id);
      } else {
        const res = await api<{ contact: { id: string } }>("/api/contacts", {
          method: "POST",
          body: JSON.stringify({
            fullName,
            linkedinUrl: linkedinUrl || null,
            jobTitle: jobTitle || null,
            email: email || null,
            phone: phone || null,
          }),
        });
        onCreated?.(res.contact.id);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
      <button className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <form
        onSubmit={onSubmit}
        className="relative z-10 w-full max-w-lg border border-[var(--line)] bg-white p-5 fade-up"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="display text-2xl">
            {kind === "lead" ? "New lead" : "New contact"}
          </h2>
          <button type="button" className="neo-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-[var(--neo-muted)]">
          {kind === "lead"
            ? "Capture stage — LinkedIn URL is the unique ID."
            : "Contact stage — progressed people with email/phone."}
        </p>

        <div className="mt-4 grid gap-3">
          <label className="text-sm">
            <span className="text-[var(--neo-muted)]">Full name</span>
            <input className="neo-input mt-1" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label className="text-sm">
            <span className="text-[var(--neo-muted)]">
              LinkedIn URL {kind === "lead" ? "(required)" : "(optional)"}
            </span>
            <input
              className="neo-input mt-1"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              required={kind === "lead"}
              placeholder="https://www.linkedin.com/in/…"
            />
          </label>
          <label className="text-sm">
            <span className="text-[var(--neo-muted)]">Job title</span>
            <input className="neo-input mt-1" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </label>
          {kind === "lead" ? (
            <>
              <label className="text-sm">
                <span className="text-[var(--neo-muted)]">Company</span>
                <input className="neo-input mt-1" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="text-[var(--neo-muted)]">Industry</span>
                <input className="neo-input mt-1" value={industry} onChange={(e) => setIndustry(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="text-[var(--neo-muted)]">Website</span>
                <input className="neo-input mt-1" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </>
          ) : (
            <>
              <label className="text-sm">
                <span className="text-[var(--neo-muted)]">Email</span>
                <input className="neo-input mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="text-[var(--neo-muted)]">Phone</span>
                <input className="neo-input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </label>
            </>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-black underline">{error}</p>}

        <button className="neo-btn neo-btn-primary mt-5 w-full" disabled={loading}>
          {loading ? "Saving…" : `Create ${kind}`}
        </button>
      </form>
    </div>
  );
}
