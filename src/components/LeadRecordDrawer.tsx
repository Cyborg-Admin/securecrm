"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ConvertLeadModal } from "@/components/ConvertLeadModal";
import { CreateOpportunityModal } from "@/components/CreateOpportunityModal";
import { DeleteRecordButton } from "@/components/DeleteRecordButton";
import {
  PipelineStepper,
  statusKeyForStage,
  type PipelineStage,
} from "@/components/PipelineStepper";
import { SaveBadge } from "@/components/SaveBadge";
import { useDynamicSave } from "@/hooks/useDynamicSave";
import { api } from "@/lib/client-api";

export type Lead = {
  id: string;
  full_name: string;
  email?: string | null;
  job_title: string | null;
  company_name: string | null;
  industry: string | null;
  website: string | null;
  location: string | null;
  headline?: string | null;
  status: string;
  source: string;
  linkedin_uid: string | null;
  owner_name?: string;
  owner_user_id?: string | null;
  company_display?: string | null;
  company_id?: string | null;
  created_at?: string;
  updated_at?: string;
  metadata_json?: string | Record<string, unknown> | null;
};

type Experience = {
  id: string;
  title: string | null;
  company_name: string | null;
  company_logo_url?: string | null;
  location: string | null;
  started_on: string | null;
  ended_on: string | null;
  started_on_sort?: string | null;
  ended_on_sort?: string | null;
  is_current: boolean | number;
  raw_text: string | null;
};

type Related = {
  company: { id: string; name: string; domain: string | null } | null;
  contact: {
    id: string;
    full_name: string;
    email: string | null;
    company_id?: string | null;
  } | null;
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

type EmailThread = {
  id: string;
  subject: string;
  snippet?: string | null;
  sourceUrl?: string | null;
  lastMessageAt?: string | null;
  participants: Array<{ email: string; name?: string | null; role?: string }>;
  messages: Array<{
    id: string;
    subject?: string | null;
    fromEmail?: string | null;
    fromName?: string | null;
    toEmails: string[];
    ccEmails: string[];
    snippet?: string | null;
    sourceUrl?: string | null;
    sentAt?: string | null;
    direction?: string | null;
  }>;
};

const ACTIVITY_OPTIONS = [
  { value: "note", label: "Note" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "task", label: "Task" },
  { value: "email", label: "Email" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "other", label: "Other" },
] as const;

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
      ["email", "Email"],
      ["job_title", "Job title"],
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
];

function leadMeta(lead: Lead): Record<string, unknown> {
  const raw = lead.metadata_json;
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

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
  if (type === "email_scanned" || type === "email") return "Email";
  if (type === "note") return "Note";
  if (type === "call") return "Call";
  if (type === "meeting") return "Meeting";
  if (type === "task") return "Task";
  if (type === "linkedin") return "LinkedIn";
  return type.replace(/_/g, " ");
}

function mailto(email: string) {
  return `mailto:${email}`;
}

type Props = {
  lead: Lead | null;
  open: boolean;
  onClose: () => void;
  onLeadUpdated: (lead: Lead) => void;
  onLeadDeleted?: (leadId: string) => void;
};

export function LeadRecordDrawer({
  lead,
  open,
  onClose,
  onLeadUpdated,
  onLeadDeleted,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("fields");
  const [draft, setDraft] = useState<Partial<Lead>>({});
  const [related, setRelated] = useState<Related | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [emailThreads, setEmailThreads] = useState<EmailThread[]>([]);
  const [convertOpen, setConvertOpen] = useState(false);
  const [oppOpen, setOppOpen] = useState(false);
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([]);
  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [activityType, setActivityType] =
    useState<(typeof ACTIVITY_OPTIONS)[number]["value"]>("note");
  const [note, setNote] = useState("");
  const [emailFrom, setEmailFrom] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [loadingSide, setLoadingSide] = useState(false);

  useEffect(() => {
    if (!lead || !open) return;
    setTab("fields");
    setDraft({
      full_name: lead.full_name,
      email: lead.email ?? "",
      job_title: lead.job_title,
      company_name: lead.company_name,
      industry: lead.industry,
      website: lead.website,
      location: lead.location,
    });
    setLoadingSide(true);
    void Promise.all([
      api<Related>(`/api/leads/${lead.id}/related`),
      api<{ activities: Activity[]; emailThreads?: EmailThread[] }>(
        `/api/leads/${lead.id}/activities`,
      ),
      api<{ stages: PipelineStage[] }>("/api/pipeline-stages?pipeline=lead"),
    ])
      .then(([rel, act, pipe]) => {
        setRelated(rel);
        setActivities(act.activities || []);
        setEmailThreads(act.emailThreads || []);
        setPipelineStages(pipe.stages || []);
      })
      .catch(() => {
        setRelated(null);
        setActivities([]);
        setEmailThreads([]);
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
          email: next.email || null,
          jobTitle: next.job_title,
          companyName: next.company_name,
          industry: next.industry,
          website: next.website,
          location: next.location,
        }),
      });
      onLeadUpdated(res.lead);
    },
    700,
    Boolean(lead && open),
  );

  function openConvertModal() {
    if (!lead || lead.status === "converted") return;
    setConvertOpen(true);
  }

  async function advancePipeline(stage: PipelineStage) {
    if (!lead) return;
    const nextStatus = statusKeyForStage(stage);
    const isWon = stage.is_won === true || stage.is_won === 1;
    if (isWon) {
      openConvertModal();
      return;
    }
    if (nextStatus === lead.status) return;
    setPipelineBusy(true);
    try {
      const res = await api<{ lead: Lead }>(`/api/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      onLeadUpdated(res.lead);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not update pipeline");
    } finally {
      setPipelineBusy(false);
    }
  }

  async function addActivity() {
    if (!lead || !note.trim()) return;
    setSavingNote(true);
    try {
      const title =
        activityType === "email"
          ? note.trim().slice(0, 120)
          : note.trim().slice(0, 80);
      const payload: Record<string, unknown> = {
        title,
        body: note.trim(),
        activityType,
      };
      if (activityType === "email") {
        const toEmails = emailTo
          .split(/[,;\s]+/)
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.includes("@"));
        if (emailFrom.trim().includes("@")) {
          payload.fromEmail = emailFrom.trim().toLowerCase();
        }
        if (toEmails.length) payload.toEmails = toEmails;
      }
      const res = await api<{ activity: Activity }>(
        `/api/leads/${lead.id}/activities`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      setActivities((prev) => [res.activity, ...prev]);
      setNote("");
      setEmailFrom("");
      setEmailTo("");
      await refreshActivity();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not save activity");
    } finally {
      setSavingNote(false);
    }
  }

  async function refreshActivity() {
    if (!lead) return;
    const act = await api<{ activities: Activity[]; emailThreads?: EmailThread[] }>(
      `/api/leads/${lead.id}/activities`,
    );
    setActivities(act.activities || []);
    setEmailThreads(act.emailThreads || []);
  }

  const meta = lead ? leadMeta(lead) : {};
  const photoUrl = typeof meta.photoUrl === "string" ? meta.photoUrl : "";
  const bio = typeof meta.bio === "string" ? meta.bio.trim() : "";
  const connectionRaw =
    typeof meta.connectionCountRaw === "string"
      ? meta.connectionCountRaw
      : typeof meta.connectionCount === "number"
        ? String(meta.connectionCount)
        : typeof meta.connectionCount === "string"
          ? meta.connectionCount
          : "";

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
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="record-avatar object-cover"
                      src={photoUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="record-avatar" aria-hidden>
                      {initials(lead.full_name)}
                    </div>
                  )}
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
                <span className="record-chip muted">{lead.source}</span>
                <span className="record-chip muted">
                  {lead.owner_name || "Unassigned"}
                </span>
                {connectionRaw ? (
                  <span className="record-chip muted" title="LinkedIn connections">
                    {/connection/i.test(connectionRaw)
                      ? connectionRaw
                      : `${connectionRaw} connections`}
                  </span>
                ) : null}
                {(draft.email || lead.email) ? (
                  <a
                    className="record-chip link"
                    href={mailto(String(draft.email || lead.email))}
                  >
                    {draft.email || lead.email}
                  </a>
                ) : null}
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

              <div className="record-pipeline">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="record-section-title" style={{ margin: 0 }}>
                    Pipeline
                  </h3>
                  <span className="record-chip">
                    {pipelineStages.find(
                      (s) => statusKeyForStage(s) === lead.status,
                    )?.name || lead.status}
                  </span>
                </div>
                <PipelineStepper
                  stages={pipelineStages}
                  currentStatus={lead.status}
                  busy={pipelineBusy}
                  onSelect={(stage) => void advancePipeline(stage)}
                />
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
                            className="block text-sm"
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

                  {bio ? (
                    <section>
                      <h3 className="record-section-title">Bio</h3>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--neo-ink)]">
                        {bio}
                      </p>
                    </section>
                  ) : null}

                  <section>
                    <h3 className="record-section-title">Quick actions</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {lead.status !== "converted" ? (
                        <button
                          type="button"
                          className="neo-btn neo-btn-primary"
                          onClick={openConvertModal}
                        >
                          Progress to contact
                        </button>
                      ) : (
                        <>
                          {related?.contact ? (
                            <button
                              type="button"
                              className="neo-btn"
                              onClick={() =>
                                router.push(`/contacts?open=${related.contact!.id}`)
                              }
                            >
                              Open contact
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="neo-btn neo-btn-primary"
                            onClick={() => setOppOpen(true)}
                            disabled={!related?.contact}
                          >
                            Create opportunity
                          </button>
                        </>
                      )}
                      {related?.company ? (
                        <button
                          type="button"
                          className="neo-btn"
                          onClick={() =>
                            router.push(`/companies?open=${related.company!.id}`)
                          }
                        >
                          Open account
                        </button>
                      ) : null}
                    </div>
                    {lead.status === "converted" && !related?.contact ? (
                      <p className="mt-2 text-xs text-[var(--neo-muted)]">
                        Converted — reload related data to create an opportunity.
                      </p>
                    ) : null}
                  </section>

                  <div className="border-t border-[var(--line)] pt-4">
                    <DeleteRecordButton
                      label="Delete lead"
                      hint="Blocked if this lead is converted, linked to a contact, or has event registrations."
                      onDelete={async () => {
                        await api(`/api/leads/${lead.id}`, { method: "DELETE" });
                        onLeadDeleted?.(lead.id);
                        onClose();
                      }}
                    />
                  </div>
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
                  <h3 className="record-section-title">
                    Roles / employment history
                  </h3>
                  <p className="text-xs text-[var(--neo-muted)]">
                    Date ranges from LinkedIn Experience (start – end). Capture or
                    Enrich a profile to refresh.
                  </p>
                  {related?.experiences?.length ? (
                    <ul className="space-y-3">
                      {related.experiences.map((exp) => {
                        const range =
                          [
                            exp.started_on,
                            exp.ended_on ||
                              (exp.is_current ? "Present" : null),
                          ]
                            .filter(Boolean)
                            .join(" – ") ||
                          exp.raw_text?.slice(0, 120) ||
                          "";
                        return (
                          <li key={exp.id} className="record-timeline-item">
                            <div className="flex gap-3">
                              {exp.company_logo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  className="record-role-logo"
                                  src={exp.company_logo_url}
                                  alt=""
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div
                                  className="record-role-logo record-role-logo-fallback"
                                  aria-hidden
                                >
                                  {(exp.company_name || exp.title || "?")
                                    .slice(0, 1)
                                    .toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
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
                                {range ? (
                                  <p className="mt-0.5 text-xs font-medium text-[var(--neo-ink)]">
                                    {range}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-[var(--neo-muted)]">
                      No employment history yet — open the LinkedIn profile and
                      Capture or Enrich (train the Experience section if roles
                      are missing).
                    </p>
                  )}
                </div>
              )}

              {tab === "activity" && (
                <div className="space-y-4">
                  <div>
                    <h3 className="record-section-title">Log activity</h3>
                    <label className="mt-2 block text-sm">
                      <span className="text-[var(--neo-muted)]">Type</span>
                      <select
                        className="neo-input mt-1"
                        value={activityType}
                        onChange={(e) =>
                          setActivityType(
                            e.target.value as (typeof ACTIVITY_OPTIONS)[number]["value"],
                          )
                        }
                      >
                        {ACTIVITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {activityType === "email" ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <label className="block text-sm">
                          <span className="text-[var(--neo-muted)]">From</span>
                          <input
                            className="neo-input mt-1"
                            type="email"
                            placeholder="you@company.com"
                            value={emailFrom}
                            onChange={(e) => setEmailFrom(e.target.value)}
                          />
                        </label>
                        <label className="block text-sm">
                          <span className="text-[var(--neo-muted)]">To</span>
                          <input
                            className="neo-input mt-1"
                            placeholder="them@company.com"
                            value={emailTo}
                            onChange={(e) => setEmailTo(e.target.value)}
                          />
                        </label>
                      </div>
                    ) : null}
                    <textarea
                      className="neo-input mt-2 min-h-[88px] resize-y"
                      placeholder={
                        activityType === "email"
                          ? "Subject / summary of the email…"
                          : "Call outcome, next step…"
                      }
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <button
                      type="button"
                      className="neo-btn neo-btn-primary mt-2"
                      disabled={savingNote || !note.trim()}
                      onClick={() => void addActivity()}
                    >
                      {savingNote ? "Saving…" : `Add ${activityType}`}
                    </button>
                  </div>

                  {emailThreads.length ? (
                    <div>
                      <h3 className="record-section-title">Email conversations</h3>
                      <ul className="mt-2 space-y-3">
                        {emailThreads.map((thread) => (
                          <li key={thread.id} className="record-timeline-item">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium">{thread.subject}</p>
                              {thread.lastMessageAt ? (
                                <span className="shrink-0 text-xs text-[var(--neo-muted)]">
                                  {formatWhen(thread.lastMessageAt)}
                                </span>
                              ) : null}
                            </div>
                            {thread.participants?.length ? (
                              <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-[var(--neo-muted)]">
                                {thread.participants.slice(0, 8).map((p) => (
                                  <a
                                    key={`${thread.id}-${p.email}`}
                                    className="underline-offset-2 hover:underline"
                                    href={mailto(p.email)}
                                  >
                                    {p.name ? `${p.name} <${p.email}>` : p.email}
                                  </a>
                                ))}
                              </p>
                            ) : null}
                            <ul className="mt-2 space-y-2 border-l border-[var(--neo-line)] pl-3">
                              {thread.messages.map((m) => (
                                <li key={m.id} className="text-sm">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-[var(--neo-muted)]">
                                      {m.sentAt ? formatWhen(m.sentAt) : "—"}
                                      {m.direction ? ` · ${m.direction}` : ""}
                                    </span>
                                    {m.sourceUrl ? (
                                      <a
                                        className="text-xs underline-offset-2 hover:underline"
                                        href={m.sourceUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        Open
                                      </a>
                                    ) : null}
                                  </div>
                                  {m.fromEmail ? (
                                    <p className="mt-0.5">
                                      <a
                                        className="underline-offset-2 hover:underline"
                                        href={mailto(m.fromEmail)}
                                      >
                                        {m.fromName
                                          ? `${m.fromName} <${m.fromEmail}>`
                                          : m.fromEmail}
                                      </a>
                                    </p>
                                  ) : null}
                                  {m.toEmails?.length ? (
                                    <p className="text-xs text-[var(--neo-muted)]">
                                      To:{" "}
                                      {m.toEmails.map((e, i) => (
                                        <span key={e}>
                                          {i > 0 ? ", " : ""}
                                          <a
                                            className="underline-offset-2 hover:underline"
                                            href={mailto(e)}
                                          >
                                            {e}
                                          </a>
                                        </span>
                                      ))}
                                    </p>
                                  ) : null}
                                  {m.snippet ? (
                                    <p className="mt-1 text-[var(--neo-muted)]">
                                      {m.snippet}
                                    </p>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div>
                    <h3 className="record-section-title">Timeline</h3>
                    {activities.length ? (
                      <ul className="mt-2 space-y-3">
                        {activities.map((a) => {
                          const meta = a.metadata || {};
                          const fromEmail =
                            typeof meta.fromEmail === "string"
                              ? meta.fromEmail
                              : null;
                          const toEmails = Array.isArray(meta.toEmails)
                            ? (meta.toEmails as string[])
                            : [];
                          const participants = Array.isArray(meta.participants)
                            ? (meta.participants as Array<{
                                email: string;
                                name?: string | null;
                              }>)
                            : [];
                          const sourceUrl =
                            typeof meta.sourceUrl === "string"
                              ? meta.sourceUrl
                              : null;
                          const isEmail =
                            a.activity_type === "email" ||
                            a.activity_type === "email_scanned";
                          return (
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
                              {isEmail && fromEmail ? (
                                <p className="mt-1 text-xs text-[var(--neo-muted)]">
                                  From:{" "}
                                  <a
                                    className="underline-offset-2 hover:underline"
                                    href={mailto(fromEmail)}
                                  >
                                    {fromEmail}
                                  </a>
                                  {toEmails.length
                                    ? " · To: "
                                    : null}
                                  {toEmails.map((e, i) => (
                                    <span key={e}>
                                      {i > 0 ? ", " : ""}
                                      <a
                                        className="underline-offset-2 hover:underline"
                                        href={mailto(e)}
                                      >
                                        {e}
                                      </a>
                                    </span>
                                  ))}
                                </p>
                              ) : null}
                              {isEmail && participants.length ? (
                                <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-[var(--neo-muted)]">
                                  {participants.slice(0, 6).map((p) => (
                                    <a
                                      key={`${a.id}-${p.email}`}
                                      className="underline-offset-2 hover:underline"
                                      href={mailto(p.email)}
                                    >
                                      {p.email}
                                    </a>
                                  ))}
                                </p>
                              ) : null}
                              {a.body ? (
                                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--neo-muted)]">
                                  {a.body}
                                </p>
                              ) : null}
                              <div className="mt-1 flex items-center gap-3 text-xs text-[var(--neo-muted)]">
                                {a.actor_name ? <span>by {a.actor_name}</span> : null}
                                {sourceUrl ? (
                                  <a
                                    className="underline-offset-2 hover:underline"
                                    href={sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Open email
                                  </a>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-[var(--neo-muted)]">
                        No activity yet. Opening matched Gmail threads logs
                        email conversations here automatically.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </aside>

      {lead ? (
        <ConvertLeadModal
          open={convertOpen}
          leadId={lead.id}
          leadName={lead.full_name}
          companyName={lead.company_name}
          defaultEmail={lead.email}
          onClose={() => setConvertOpen(false)}
          onConverted={({ contactId, opportunityId }) => {
            onLeadUpdated({ ...lead, status: "converted" });
            if (opportunityId) {
              router.push(`/opportunities?open=${opportunityId}`);
            } else {
              router.push(`/contacts?open=${contactId}`);
            }
          }}
        />
      ) : null}

      {lead && related?.contact ? (
        <CreateOpportunityModal
          open={oppOpen}
          onClose={() => setOppOpen(false)}
          contactId={related.contact.id}
          companyId={related.contact.company_id || related.company?.id || lead.company_id}
          defaultName={
            lead.company_name
              ? `${lead.full_name} · ${lead.company_name}`
              : `${lead.full_name} opportunity`
          }
          contextLabel={`From lead · ${lead.full_name}`}
          onCreated={(id) => router.push(`/opportunities?open=${id}`)}
        />
      ) : null}
    </>
  );
}
