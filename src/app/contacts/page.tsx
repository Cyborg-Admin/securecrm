"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { SaveBadge } from "@/components/SaveBadge";
import { QuickCreateModal } from "@/components/QuickCreateModal";
import { useDynamicSave } from "@/hooks/useDynamicSave";
import { api } from "@/lib/client-api";

type Contact = {
  id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_uid: string | null;
  company_name?: string | null;
  lead_name?: string | null;
  owner_name?: string | null;
  lead_id?: string | null;
};

type RelatedLead = {
  id: string;
  full_name: string;
  job_title: string | null;
  status: string;
};

function ContactsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Contact | null>(null);
  const [draft, setDraft] = useState<Partial<Contact>>({});
  const [relatedLeads, setRelatedLeads] = useState<RelatedLead[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [mobileDetail, setMobileDetail] = useState(false);

  async function load(query = q) {
    const data = await api<{ contacts: Contact[] }>(
      `/api/contacts?q=${encodeURIComponent(query)}`,
    );
    setContacts(data.contacts);
    const openId = search.get("open");
    if (openId) {
      const found = data.contacts.find((c) => c.id === openId);
      if (found) void openContact(found);
    }
  }

  async function openContact(contact: Contact) {
    setSelected(contact);
    setDraft({
      full_name: contact.full_name,
      job_title: contact.job_title,
      email: contact.email,
      phone: contact.phone,
    });
    setMobileDetail(true);
    const detail = await api<{ relatedLeads: RelatedLead[] }>(
      `/api/contacts/${contact.id}`,
    );
    setRelatedLeads(detail.relatedLeads || []);
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
      const res = await api<{ contact: Contact }>(`/api/contacts/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: next.full_name,
          jobTitle: next.job_title,
          email: next.email,
          phone: next.phone,
        }),
      });
      setSelected(res.contact);
      setContacts((prev) =>
        prev.map((c) => (c.id === res.contact.id ? { ...c, ...res.contact } : c)),
      );
    },
    700,
    Boolean(selected),
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl">Contacts</h1>
          <p className="mt-1 text-[var(--neo-muted)]">
            Progressed leads — email/phone live here. Related leads stay linked.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SaveBadge status={status} error={error} />
          <button className="neo-btn neo-btn-primary" onClick={() => setShowCreate(true)}>
            Add contact
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="neo-raised p-4">
          <input
            className="neo-input"
            placeholder="Search contacts…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="mt-4 max-h-[70vh] space-y-2 overflow-auto">
            {contacts.map((c) => (
              <li key={c.id}>
                <button
                  className={`w-full rounded-2xl p-3 text-left ${
                    selected?.id === c.id ? "neo-pressed" : "neo-inset"
                  }`}
                  onClick={() => void openContact(c)}
                >
                  <p className="font-medium">{c.full_name}</p>
                  <p className="text-sm text-[var(--neo-muted)]">
                    {[c.job_title, c.company_name, c.email].filter(Boolean).join(" · ") || "No extras"}
                  </p>
                </button>
              </li>
            ))}
            {!contacts.length && (
              <li className="text-sm text-[var(--neo-muted)]">No contacts yet.</li>
            )}
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
                <h2 className="display text-2xl">Contact detail</h2>
                <button className="neo-btn lg:hidden" onClick={() => setMobileDetail(false)}>
                  Close
                </button>
              </div>
              {selected.linkedin_uid && (
                <p className="break-all text-xs text-[var(--neo-muted)]">{selected.linkedin_uid}</p>
              )}
              {(
                [
                  ["full_name", "Full name"],
                  ["job_title", "Job title"],
                  ["email", "Email"],
                  ["phone", "Phone"],
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

              <div className="neo-inset p-3">
                <p className="text-sm font-medium">Related leads</p>
                <ul className="mt-2 space-y-2">
                  {relatedLeads.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        className="text-left text-sm underline"
                        onClick={() => router.push(`/leads?open=${l.id}`)}
                      >
                        {l.full_name}
                        {l.job_title ? ` · ${l.job_title}` : ""} · {l.status}
                      </button>
                    </li>
                  ))}
                  {!relatedLeads.length && (
                    <li className="text-xs text-[var(--neo-muted)]">No related leads.</li>
                  )}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-[var(--neo-muted)]">Select a contact to edit. Changes autosave.</p>
          )}
        </aside>
      </div>

      {showCreate && (
        <QuickCreateModal
          kind="contact"
          onClose={() => setShowCreate(false)}
          onCreated={() => void load(q)}
        />
      )}
    </>
  );
}

export default function ContactsPage() {
  return (
    <AppShell>
      <Suspense fallback={<p className="text-[var(--neo-muted)]">Loading contacts…</p>}>
        <ContactsInner />
      </Suspense>
    </AppShell>
  );
}
