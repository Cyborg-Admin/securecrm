"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/client-api";

type EventRow = {
  id: string;
  name: string;
  location: string | null;
  starts_at: string | null;
  status: string;
  registration_count?: number | string;
};

type Registration = {
  id: string;
  track: string;
  registrant_type: string;
  registrant_id: string;
  status: string;
  stage_name?: string | null;
};

type Lead = { id: string; full_name: string };
type Contact = { id: string; full_name: string };
type Opp = { id: string; name: string };

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    location: "",
    startsAt: "",
    status: "draft",
  });
  const [regForm, setRegForm] = useState({
    track: "delegate",
    registrantType: "contact",
    registrantId: "",
  });

  async function load() {
    const [e, l, c, o] = await Promise.all([
      api<{ events: EventRow[] }>("/api/events"),
      api<{ leads: Lead[] }>("/api/leads?limit=100"),
      api<{ contacts: Contact[] }>("/api/contacts"),
      api<{ opportunities: Opp[] }>("/api/opportunities").catch(() => ({
        opportunities: [] as Opp[],
      })),
    ]);
    setEvents(e.events);
    setLeads(l.leads || []);
    setContacts(c.contacts || []);
    setOpps(o.opportunities || []);
  }

  async function openEvent(id: string) {
    setSelectedId(id);
    const data = await api<{ registrations: Registration[] }>(`/api/events/${id}`);
    setRegistrations(data.registrations || []);
  }

  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await api<{ event: EventRow }>("/api/events", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          location: form.location || null,
          startsAt: form.startsAt || null,
          status: form.status,
        }),
      });
      setForm({ name: "", location: "", startsAt: "", status: "draft" });
      await load();
      if (res.event?.id) await openEvent(res.event.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function addRegistration(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !regForm.registrantId) return;
    setError(null);
    try {
      await api(`/api/events/${selectedId}/registrations`, {
        method: "POST",
        body: JSON.stringify(regForm),
      });
      setRegForm((f) => ({ ...f, registrantId: "" }));
      await openEvent(selectedId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    }
  }

  const registrantOptions =
    regForm.registrantType === "lead"
      ? leads.map((x) => ({ id: x.id, label: x.full_name }))
      : regForm.registrantType === "opportunity"
        ? opps.map((x) => ({ id: x.id, label: x.name }))
        : contacts.map((x) => ({ id: x.id, label: x.full_name }));

  return (
    <AppShell>
      <h1 className="display text-3xl">Events</h1>
      <p className="mt-1 text-[var(--neo-muted)]">
        Track registrations for sales pipeline and delegate attendance. Link
        contacts, leads, or opportunities.
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
          placeholder="Event name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
        <input
          className="neo-input"
          placeholder="Location"
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
        />
        <input
          className="neo-input"
          type="datetime-local"
          value={form.startsAt}
          onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
        />
        <select
          className="neo-input md:col-span-2"
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="live">Live</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button className="neo-btn neo-btn-primary md:col-span-2" type="submit">
          Create event
        </button>
      </form>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <ul className="neo-raised max-h-[60vh] space-y-2 overflow-auto p-3">
          {events.map((ev) => (
            <li key={ev.id}>
              <button
                type="button"
                className={`w-full rounded-2xl p-3 text-left ${
                  selectedId === ev.id ? "neo-pressed" : "neo-inset"
                }`}
                onClick={() => void openEvent(ev.id)}
              >
                <p className="font-medium">{ev.name}</p>
                <p className="text-sm text-[var(--neo-muted)]">
                  {ev.status}
                  {ev.location ? ` · ${ev.location}` : ""}
                  {` · ${Number(ev.registration_count || 0)} regs`}
                </p>
              </button>
            </li>
          ))}
        </ul>

        <aside className="neo-raised space-y-4 p-4">
          {selectedId ? (
            <>
              <h2 className="display text-xl">Registrations</h2>
              <form onSubmit={addRegistration} className="grid gap-2">
                <select
                  className="neo-input"
                  value={regForm.track}
                  onChange={(e) =>
                    setRegForm((f) => ({ ...f, track: e.target.value }))
                  }
                >
                  <option value="sales">Sales track</option>
                  <option value="delegate">Delegate track</option>
                </select>
                <select
                  className="neo-input"
                  value={regForm.registrantType}
                  onChange={(e) =>
                    setRegForm((f) => ({
                      ...f,
                      registrantType: e.target.value,
                      registrantId: "",
                    }))
                  }
                >
                  <option value="contact">Contact</option>
                  <option value="lead">Lead</option>
                  <option value="opportunity">Opportunity</option>
                </select>
                <select
                  className="neo-input"
                  value={regForm.registrantId}
                  onChange={(e) =>
                    setRegForm((f) => ({ ...f, registrantId: e.target.value }))
                  }
                  required
                >
                  <option value="">Select registrant…</option>
                  {registrantOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button className="neo-btn neo-btn-primary" type="submit">
                  Add registration
                </button>
              </form>
              <ul className="space-y-2 text-sm">
                {registrations.map((r) => (
                  <li key={r.id} className="record-timeline-item">
                    <p className="font-medium">
                      {r.track} · {r.registrant_type}
                    </p>
                    <p className="text-[var(--neo-muted)]">
                      {r.status}
                      {r.stage_name ? ` · ${r.stage_name}` : ""}
                    </p>
                  </li>
                ))}
                {!registrations.length ? (
                  <li className="text-[var(--neo-muted)]">No registrations yet.</li>
                ) : null}
              </ul>
            </>
          ) : (
            <p className="text-[var(--neo-muted)]">Select an event.</p>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
