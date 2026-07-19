"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SaveBadge } from "@/components/SaveBadge";
import { useDynamicSave } from "@/hooks/useDynamicSave";
import { api } from "@/lib/client-api";

export type Lead = {
  id: string;
  full_name: string;
  job_title: string | null;
  company_name: string | null;
  industry: string | null;
  website: string | null;
  location: string | null;
  headline?: string | null;
  status: string;
  source: string;
  linkedin_uid: string;
  owner_name?: string;
  company_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

type Experience = {
  id: string;
  title: string | null;
  company_name: string | null;
  location: string | null;
  started_on: string | null;
  ended_on: string | null;
  is_current: boolean | number;
  raw_text: string | null;
};

type Related = {
  company: { id: string; name: string; domain: string | null } | null;
  contact: { id: string; full_name: string; email: string | null } | null;
  siblingLeads: Array<{
    id: string;
    full_name: string;
    job_title: string | null;
    status: string;
  }>;
  experiences?: Experience[];
};

type Activity = {
  id: string;
  activity_type: string;
  title: string;
  body: string | null;
  actor_name?: string | null;
  occurred_at: string;
  metadata?: Record<string, unknown>;
};

type TabId = "fields" | "related" | "roles" | "activity";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "fields", label: "About" },
  { id: "related", label: "Related" },
  { id: "roles", label: "Roles" },
  { id: "activity", label: "Activity" },
];

const FIELD_GROUPS: Array<{
  title: string;
  fields: Array<[keyof Lead, string]>;
}> = [
  {
    title: "Identity",
    fields: [
      ["full_name", "Full name"],
      ["job_title", "Job title"],
      ["headline", "Headline"],
    ],
  },
  {
    title: "Company",
    fields: [
      ["company_name", "Company"],
      ["industry", "Industry"],
      ["website", "Website"],
      ["location", "Location"],
    ],
  },
  {
    title: "Pipeline",
    fields: [["status", "Status"]],
  },
];

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

function formatWhen(value: string) {
  try {
    return new Date(value).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function activityTone(type: string) {
  if (type === "email_scanned") return "Email";
  if (type === "note") return "Note";
  if (type === "call") return "Call";
  if (type === "meeting") return "Meeting";
  return type.replace(/_/g, " ");
}

type Props = {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onLeadUpdated: (lead: Lead) => void;
};

export function LeadRecordDrawer({
  lead,
  open,
  onClose,
  onLeadUpdated,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("fields");
  const [draft, setDraft] = useState<Partial<Lead>>({});
  const [related, setRelated] = useState<Related | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [converting, setConverting] = useState(false);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [loadingSide, setLoadingSide] = useState(false);

  useEffect(() => {
    if (!lead || !open) return;
    setTab("fields");
    setDraft({
      full_name: lead.full_name,
      job_title: lead.job_title,
      company_name: lead.company_name,
      industry: lead.industry,
      website: lead.website,
      location: lead.location,
      headline: lead.headline ?? "",
      status: lead.status,
    });
    setLoadingSide(true);
    void Promise.all([
      api<Related>(`/api/leads/${lead.id}/related`),
      api<{ activities: Activity[] }>(`/api/leads/${lead.id}/activities`),
    ])
      .then(([rel, act]) => {
        setRelated(rel);
        setActivities(act.activities || []);
      })
      .catch(() => {
        setRelated(null);
        setActivities([]);
      })
      .finally(() => setLoadingSide(false));
  }, [lead?.id, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const { status, error } = useDynamicSave(
    draft,
    async (next) => {
      if (!lead) return;
      const res = await api<{ lead: Lead }>(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          fullName: next.full_name,
          jobTitle: next.job_title,
          companyName: next.company_name,
          industry: next.industry,
          website: next.website,
          location: next.location,
          headline: next.headline,
          status: next.status,
        }),
      });
      onLeadUpdated(res.lead);
    },
    700,
    Boolean(lead && open),
  );

  async function convertToContact() {
    if (!lead) return;
    setConverting(true);
    try {
      const res = await api<{ contact: { id: string } }>(
        `/api/leads/${lead.id}/convert`,
        { method: "POST", body: JSON.stringify({}) },
      );
      router.push(`/contacts?open=${res.contact.id}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Convert failed");
    } finally {
      setConverting(false);
    }
  }

  async function addNote() {
    if (!lead || !note.trim()) return;
    setSavingNote(true);
    try {
      const res = await api<{ activity: Activity }>(
        `/api/leads/${lead.id}/activities`,
        {
          method: "POST",
          body: JSON.stringify({
            title: note.trim().slice(0, 80),
            body: note.trim(),
            activityType: "note",
          }),
        },
      );
      setActivities((prev) => [res.activity, ...prev]);
      setNote("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not save note");
    } finally {
      setSavingNote(false);
    }
  }

  async function refreshActivity() {
    if (!lead) return;
    const act = await api<{ activities: Activity[] }>(
      `/api/leads/${lead.id}/activities`,
    );
    setActivities(act.activities || []);
  }

  return (
    <>
      <div
        className={`record-drawer-backdrop ${open ? "is-open" : ""}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={`record-drawer ${open ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={lead ? `Lead ${lead.full_name}` : "Lead record"}
      >
        {lead ? (
          <div className="flex h-full flex-col">
            <header className="record-drawer-header">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="record-avatar" aria-hidden>
                    {initials(lead.full_name)}
                  </div>
                  <div className="min-w-0">
                    <p className="page-kicker">Lead</p>
                    <h2 className="display truncate text-2xl leading-tight">
                      {draft.full_name || lead.full_name}
                    </h2>
                    <p className="mt-1 truncate text-sm text-[var(--neo-muted)]">
                      {[draft.job_title || lead.job_title, draft.company_name || lead.company_name]
                        .filter(Boolean)
                        .join(" · ") || "No title yet"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <SaveBadge status={status} error={error} />
                  <button
                    type="button"
                    className="neo-btn"
                    onClick={onClose}
                    aria-label="Close lead record"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="record-meta">
                <span className="record-chip">{lead.status}</span>
                <span className="record-chip muted">{lead.source}</span>
                <span className="record-chip muted">
                  {lead.owner_name || "Unassigned"}
                </span>
                {lead.linkedin_uid ? (
                  <a
                    className="record-chip link"
                    href={`https://${lead.linkedin_uid.replace(/^https?:\/\//, "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    LinkedIn
                  </a>
                ) : null}
              </div>

              <nav className="record-tabs" aria-label="Lead sections">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`record-tab ${tab === t.id ? "is-active" : ""}`}
                    onClick={() => {
                      setTab(t.id);
                      if (t.id === "activity") void refreshActivity();
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </header>

            <div className="record-drawer-body">
              {loadingSide && tab !== "fields" ? (
                <p className="text-sm text-[var(--neo-muted)]">Loading…</p>
              ) : null}

              {tab === "fields" && (
                <div className="space-y-5">
                  {FIELD_GROUPS.map((group) => (
                    <section key={group.title}>
                      <h3 className="record-section-title">{group.title}</h3>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        {group.fields.map(([key, label]) => (
                          <label
                            key={key}
                            className={`block text-sm ${key === "headline" ? "sm:col-span-2" : ""}`}
                          >
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
                    </section>
                  ))}

                  <button
                    className="neo-btn neo-btn-primary w-full"
                    disabled={converting || lead.status === "converted"}
                    onClick={() => void convertToContact()}
                  >
                    {lead.status === "converted"
                      ? "Already converted"
                      : converting
                        ? "Converting…"
                        : "Progress to contact"}
                  </button>
                </div>
              )}

              {tab === "related" && (
                <div className="space-y-4 text-sm">
                  <section>
                    <h3 className="record-section-title">Company</h3>
                    {related?.company ? (
                      <button
                        type="button"
                        className="record-link-row"
                        onClick={() => router.push("/companies")}
                      >
                        <span className="font-medium">{related.company.name}</span>
                        <span className="text-[var(--neo-muted)]">
                          {related.company.domain || "Open companies"}
                        </span>
                      </button>
                    ) : (
                      <p className="mt-2 text-[var(--neo-muted)]">
                        No company object linked.
                      </p>
                    )}
                  </section>

                  <section>
                    <h3 className="record-section-title">Contact</h3>
                    {related?.contact ? (
                      <button
                        type="button"
                        className="record-link-row"
                        onClick={() =>
                          router.push(`/contacts?open=${related.contact!.id}`)
                        }
                      >
                        <span className="font-medium">
                          {related.contact.full_name}
                        </span>
                        <span className="text-[var(--neo-muted)]">
                          {related.contact.email || "Open contact"}
                        </span>
                      </button>
                    ) : (
                      <p className="mt-2 text-[var(--neo-muted)]">
                        No contact yet — progress this lead.
                      </p>
                    )}
                  </section>

                  {!!related?.siblingLeads?.length && (
                    <section>
                      <h3 className="record-section-title">Same company</h3>
                      <ul className="mt-2 space-y-1">
                        {related.siblingLeads.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              className="underline"
                              onClick={() =>
                                router.push(`/leads?open=${s.id}`)
                              }
                            >
                              {s.full_name}
                              {s.job_title ? ` · ${s.job_title}` : ""}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}

              {tab === "roles" && (
                <div className="space-y-3 text-sm">
                  <h3 className="record-section-title">Roles / history</h3>
                  {related?.experiences?.length ? (
                    <ul className="space-y-3">
                      {related.experiences.map((exp) => (
                        <li key={exp.id} className="record-timeline-item">
                          <p className="font-medium">
                            {exp.title || "Role"}
                            {exp.is_current ? (
                              <span className="ml-2 text-xs text-[var(--accent-deep)]">
                                Current
                              </span>
                            ) : null}
                          </p>
                          <p className="text-[var(--neo-muted)]">
                            {[exp.company_name, exp.location]
                              .filter(Boolean)
                              .join(" · ") || "—"}
                          </p>
                          <p className="text-xs text-[var(--neo-muted)]">
                            {[
                              exp.started_on,
                              exp.ended_on ||
                                (exp.is_current ? "Present" : null),
                            ]
                              .filter(Boolean)
                              .join(" – ") ||
                              exp.raw_text?.slice(0, 120) ||
                              ""}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[var(--neo-muted)]">
                      No appointment history yet — deep-scrape the LinkedIn
                      profile.
                    </p>
                  )}
                </div>
              )}

              {tab === "activity" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="record-section-title">Log a note</h3>
                    <textarea
                      className="neo-input mt-2 min-h-[88px] resize-y"
                      placeholder="Call outcome, next step…"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <button
                      type="button"
                      className="neo-btn neo-btn-primary mt-2"
                      disabled={savingNote || !note.trim()}
                      onClick={() => void addNote()}
                    >
                      {savingNote ? "Saving…" : "Add note"}
                    </button>
                  </div>

                  <div>
                    <h3 className="record-section-title">Timeline</h3>
                    {activities.length ? (
                      <ul className="mt-2 space-y-3">
                        {activities.map((a) => (
                          <li key={a.id} className="record-timeline-item">
                            <div className="flex items-center justify-between gap-2">
                              <span className="record-chip">
                                {activityTone(a.activity_type)}
                              </span>
                              <span className="text-xs text-[var(--neo-muted)]">
                                {formatWhen(a.occurred_at)}
                              </span>
                            </div>
                            <p className="mt-1 font-medium">{a.title}</p>
                            {a.body ? (
                              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--neo-muted)]">
                                {a.body}
                              </p>
                            ) : null}
                            {a.actor_name ? (
                              <p className="mt-1 text-xs text-[var(--neo-muted)]">
                                by {a.actor_name}
                              </p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-[var(--neo-muted)]">
                        No activity yet. Opening matched Gmail threads logs
                        emails here automatically.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </aside>
    </>
  );
}
