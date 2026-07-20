"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { api } from "@/lib/client-api";
import { FEATURE_KEYS } from "@/lib/features";

type Tab =
  | "org"
  | "users"
  | "roles"
  | "features"
  | "pipelines"
  | "extension";

type KeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  roles: string | null;
  is_active: number | boolean;
};

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  is_system: number | boolean;
  permissions: string[];
};

type StageRow = {
  id: string;
  pipeline_key: string;
  name: string;
  sort_order: number;
  probability: number;
  requires_approval: number | boolean;
};

type OrgPayload = {
  organization: { id: string; name: string; slug: string };
  settings: {
    timezone: string;
    currency: string;
    chromeExtensionStoreUrl?: string;
    chromeExtensionId?: string;
    opportunityApproval: {
      enabled: boolean;
      requireApprovalStageIds: string[];
      approverUserIds: string[];
    };
  };
  features: Record<string, boolean>;
};

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "org", label: "Organization" },
  { id: "users", label: "Users" },
  { id: "roles", label: "Roles" },
  { id: "features", label: "Features" },
  { id: "pipelines", label: "Pipelines" },
  { id: "extension", label: "Extension" },
];

function SettingsInner() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("org");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>("—");
  const [storeUrl, setStoreUrl] = useState("");
  const [extensionId, setExtensionId] = useState("");

  const [org, setOrg] = useState<OrgPayload | null>(null);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [timezone, setTimezone] = useState("Europe/London");
  const [currency, setCurrency] = useState("GBP");
  const [approvalEnabled, setApprovalEnabled] = useState(true);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [allPerms, setAllPerms] = useState<Array<{ code: string; description: string }>>(
    [],
  );
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [rolePerms, setRolePerms] = useState<string[]>([]);

  const [invite, setInvite] = useState({
    fullName: "",
    email: "",
    password: "",
    roleName: "Rep",
  });

  const [stages, setStages] = useState<StageRow[]>([]);
  const [newStage, setNewStage] = useState({
    pipelineKey: "lead",
    name: "",
    requiresApproval: false,
  });

  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [keyName, setKeyName] = useState("Integration");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);

  async function loadOrg() {
    const data = await api<OrgPayload>("/api/org");
    setOrg(data);
    setOrgName(data.organization.name);
    setOrgSlug(data.organization.slug);
    setTimezone(data.settings.timezone);
    setCurrency(data.settings.currency);
    setApprovalEnabled(data.settings.opportunityApproval.enabled);
    setStoreUrl(data.settings.chromeExtensionStoreUrl || "");
    setExtensionId(data.settings.chromeExtensionId || "");
  }

  async function loadUsers() {
    const data = await api<{ users: UserRow[] }>("/api/users");
    setUsers(data.users);
  }

  async function loadRoles() {
    const data = await api<{
      roles: RoleRow[];
      allPermissions: Array<{ code: string; description: string }>;
    }>("/api/roles");
    setRoles(data.roles);
    setAllPerms(data.allPermissions);
    if (!selectedRoleId && data.roles[0]) {
      setSelectedRoleId(data.roles[0].id);
      setRolePerms(data.roles[0].permissions);
    } else if (selectedRoleId) {
      const r = data.roles.find((x) => x.id === selectedRoleId);
      if (r) setRolePerms(r.permissions);
    }
  }

  async function loadStages() {
    const data = await api<{ stages: StageRow[] }>("/api/pipeline-stages");
    setStages(data.stages);
  }

  async function loadKeys() {
    const data = await api<{ keys: KeyRow[] }>("/api/settings/api-keys");
    setKeys(data.keys);
  }

  useEffect(() => {
    const t = searchParams.get("tab");
    if (
      t === "org" ||
      t === "users" ||
      t === "roles" ||
      t === "features" ||
      t === "pipelines" ||
      t === "extension"
    ) {
      setTab(t);
    }
  }, [searchParams]);

  useEffect(() => {
    void api<{ version: string }>("/api/version")
      .then((v) => setAppVersion(v.version))
      .catch(() => undefined);
    void loadOrg().catch((e) => setError(e.message));
    void loadUsers().catch(() => undefined);
    void loadRoles().catch(() => undefined);
    void loadStages().catch(() => undefined);
    void loadKeys().catch(() => undefined);
  }, []);

  useEffect(() => {
    const r = roles.find((x) => x.id === selectedRoleId);
    if (r) setRolePerms(r.permissions);
  }, [selectedRoleId, roles]);

  async function saveOrg(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus(null);
    try {
      await api("/api/org", {
        method: "PATCH",
        body: JSON.stringify({
          name: orgName,
          slug: orgSlug,
          settings: {
            timezone,
            currency,
            opportunityApproval: {
              enabled: approvalEnabled,
              requireApprovalStageIds:
                org?.settings.opportunityApproval.requireApprovalStageIds || [],
              approverUserIds:
                org?.settings.opportunityApproval.approverUserIds || [],
            },
          },
        }),
      });
      setStatus("Organization saved.");
      await loadOrg();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function saveFeatures() {
    if (!org) return;
    setError(null);
    try {
      await api("/api/org", {
        method: "PATCH",
        body: JSON.stringify({ features: org.features }),
      });
      setStatus("Feature access updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function inviteUser(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify(invite),
      });
      setInvite({ fullName: "", email: "", password: "", roleName: "Rep" });
      setStatus("User invited.");
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    }
  }

  async function toggleUser(u: UserRow) {
    const active = Boolean(u.is_active);
    await api(`/api/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !active }),
    });
    await loadUsers();
  }

  async function setUserRole(u: UserRow, roleName: string) {
    await api(`/api/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ roleName }),
    });
    await loadUsers();
  }

  async function saveRolePerms() {
    if (!selectedRoleId) return;
    await api(`/api/roles/${selectedRoleId}`, {
      method: "PATCH",
      body: JSON.stringify({ permissions: rolePerms }),
    });
    setStatus("Role permissions saved.");
    await loadRoles();
  }

  async function createStage(e: FormEvent) {
    e.preventDefault();
    await api("/api/pipeline-stages", {
      method: "POST",
      body: JSON.stringify({
        pipelineKey: newStage.pipelineKey,
        name: newStage.name,
        requiresApproval: newStage.requiresApproval,
      }),
    });
    setNewStage((s) => ({ ...s, name: "" }));
    await loadStages();
  }

  async function toggleStageApproval(s: StageRow) {
    await api("/api/pipeline-stages", {
      method: "PATCH",
      body: JSON.stringify({
        id: s.id,
        requiresApproval: !Boolean(s.requires_approval),
      }),
    });
    await loadStages();
  }

  async function createKey(e: FormEvent) {
    e.preventDefault();
    const res = await api<{ apiKey: string }>("/api/settings/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: keyName }),
    });
    setCreatedKey(res.apiKey);
    await loadKeys();
  }

  async function revokeKey(id: string) {
    if (!confirm("Revoke this API key? It will stop working immediately.")) {
      return;
    }
    setRevokingKeyId(id);
    setError(null);
    try {
      await api(`/api/settings/api-keys/${id}`, { method: "DELETE" });
      setCreatedKey(null);
      await loadKeys();
      setStatus("API key revoked.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke key");
    } finally {
      setRevokingKeyId(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-3xl">Settings</h1>
          <p className="mt-1 text-[var(--neo-muted)]">
            Organization, access control, pipelines, and integrations · app v
            {appVersion}
          </p>
        </div>
      </div>

      <nav className="record-tabs mt-5" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`record-tab ${tab === t.id ? "is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {status ? (
        <p className="mt-3 text-sm text-[var(--accent-deep)]">{status}</p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-[var(--neo-danger)]">{error}</p>
      ) : null}

      {tab === "org" && (
        <form onSubmit={saveOrg} className="neo-raised mt-4 grid gap-3 p-5 md:grid-cols-2">
          <label className="text-sm md:col-span-2">
            <span className="text-[var(--neo-muted)]">Organization name</span>
            <input
              className="neo-input mt-1"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
            />
          </label>
          <label className="text-sm">
            <span className="text-[var(--neo-muted)]">Slug</span>
            <input
              className="neo-input mt-1"
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value)}
              required
              pattern="[a-z0-9-]+"
            />
          </label>
          <label className="text-sm">
            <span className="text-[var(--neo-muted)]">Timezone</span>
            <input
              className="neo-input mt-1"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-[var(--neo-muted)]">Currency</span>
            <input
              className="neo-input mt-1"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              checked={approvalEnabled}
              onChange={(e) => setApprovalEnabled(e.target.checked)}
            />
            Enable opportunity approval process (stages marked “requires approval”)
          </label>
          <button className="neo-btn neo-btn-primary md:col-span-2" type="submit">
            Save organization
          </button>
        </form>
      )}

      {tab === "users" && (
        <div className="mt-4 space-y-4">
          <form
            onSubmit={inviteUser}
            className="neo-raised grid gap-3 p-4 md:grid-cols-2"
          >
            <input
              className="neo-input"
              placeholder="Full name"
              value={invite.fullName}
              onChange={(e) => setInvite((i) => ({ ...i, fullName: e.target.value }))}
              required
            />
            <input
              className="neo-input"
              type="email"
              placeholder="Email"
              value={invite.email}
              onChange={(e) => setInvite((i) => ({ ...i, email: e.target.value }))}
              required
            />
            <input
              className="neo-input"
              type="password"
              placeholder="Temp password (10+)"
              value={invite.password}
              onChange={(e) => setInvite((i) => ({ ...i, password: e.target.value }))}
              required
              minLength={10}
            />
            <select
              className="neo-input"
              value={invite.roleName}
              onChange={(e) => setInvite((i) => ({ ...i, roleName: e.target.value }))}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name}
                </option>
              ))}
            </select>
            <button className="neo-btn neo-btn-primary md:col-span-2" type="submit">
              Invite user
            </button>
          </form>
          <ul className="space-y-2">
            {users.map((u) => (
              <li
                key={u.id}
                className="neo-raised flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="font-medium">{u.full_name}</p>
                  <p className="text-sm text-[var(--neo-muted)]">{u.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="neo-input w-auto"
                    value={(u.roles || "Rep").split(",")[0]}
                    onChange={(e) => void setUserRole(u, e.target.value)}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                  <button className="neo-btn text-sm" type="button" onClick={() => void toggleUser(u)}>
                    {u.is_active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "roles" && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr]">
          <ul className="neo-raised space-y-1 p-3">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                    selectedRoleId === r.id ? "neo-pressed" : "hover:bg-white/70"
                  }`}
                  onClick={() => setSelectedRoleId(r.id)}
                >
                  {r.name}
                  {r.is_system ? (
                    <span className="ml-2 text-xs text-[var(--neo-muted)]">system</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          <div className="neo-raised p-4">
            <p className="font-medium">Permissions</p>
            <div className="mt-3 grid max-h-[50vh] gap-2 overflow-auto sm:grid-cols-2">
              {allPerms.map((p) => (
                <label key={p.code} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={rolePerms.includes(p.code)}
                    onChange={(e) => {
                      setRolePerms((prev) =>
                        e.target.checked
                          ? [...prev, p.code]
                          : prev.filter((c) => c !== p.code),
                      );
                    }}
                  />
                  <span>
                    <span className="font-medium">{p.code}</span>
                    <span className="block text-xs text-[var(--neo-muted)]">
                      {p.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <button
              type="button"
              className="neo-btn neo-btn-primary mt-4"
              onClick={() => void saveRolePerms()}
            >
              Save role permissions
            </button>
          </div>
        </div>
      )}

      {tab === "features" && org && (
        <div className="neo-raised mt-4 p-5">
          <p className="text-sm text-[var(--neo-muted)]">
            Toggle which areas appear for this organization. Permissions still apply.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {FEATURE_KEYS.map((key) => (
              <li key={key}>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                  <span className="capitalize">{key}</span>
                  <input
                    type="checkbox"
                    checked={org.features[key] !== false}
                    onChange={(e) =>
                      setOrg({
                        ...org,
                        features: { ...org.features, [key]: e.target.checked },
                      })
                    }
                  />
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="neo-btn neo-btn-primary mt-4"
            onClick={() => void saveFeatures()}
          >
            Save feature access
          </button>
        </div>
      )}

      {tab === "pipelines" && (
        <div className="mt-4 space-y-4">
          <form
            onSubmit={createStage}
            className="neo-raised grid gap-3 p-4 md:grid-cols-3"
          >
            <select
              className="neo-input"
              value={newStage.pipelineKey}
              onChange={(e) =>
                setNewStage((s) => ({ ...s, pipelineKey: e.target.value }))
              }
            >
              <option value="lead">Lead</option>
              <option value="opportunity">Opportunity</option>
              <option value="event_sales">Event · Sales</option>
              <option value="event_delegate">Event · Delegate</option>
            </select>
            <input
              className="neo-input"
              placeholder="Stage name"
              value={newStage.name}
              onChange={(e) => setNewStage((s) => ({ ...s, name: e.target.value }))}
              required
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newStage.requiresApproval}
                onChange={(e) =>
                  setNewStage((s) => ({
                    ...s,
                    requiresApproval: e.target.checked,
                  }))
                }
              />
              Requires approval
            </label>
            <button className="neo-btn neo-btn-primary md:col-span-3" type="submit">
              Add stage
            </button>
          </form>
          {(["lead", "opportunity", "event_sales", "event_delegate"] as const).map((key) => (
            <section key={key} className="neo-raised p-4">
              <h3 className="record-section-title">
                {key === "lead" ? "Lead" : key.replace("_", " · ")}
              </h3>
              <ul className="mt-2 space-y-2">
                {stages
                  .filter((s) => s.pipeline_key === key)
                  .map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm"
                    >
                      <span>
                        {s.sort_order + 1}. {s.name}{" "}
                        <span className="text-[var(--neo-muted)]">
                          ({s.probability}%)
                        </span>
                      </span>
                      {key === "opportunity" ? (
                        <button
                          type="button"
                          className="neo-btn text-xs"
                          onClick={() => void toggleStageApproval(s)}
                        >
                          {s.requires_approval
                            ? "Approval required"
                            : "No approval"}
                        </button>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {tab === "extension" && (
        <div className="neo-raised mt-4 space-y-5 p-5">
          <div>
            <p className="text-sm text-[var(--neo-muted)]">
              Team members install from{" "}
              <Link className="underline" href="/extension">
                Extension → Add to Chrome
              </Link>
              , then sign in with their KINETIC email and password in the side
              panel. API keys below are for other integrations only.
            </p>
            <Link href="/extension" className="neo-btn neo-btn-primary mt-3 inline-block">
              Open install page
            </Link>
          </div>

          <form
            className="space-y-3 border-t border-[var(--line)] pt-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setStatus(null);
              try {
                await api("/api/org", {
                  method: "PATCH",
                  body: JSON.stringify({
                    settings: {
                      chromeExtensionStoreUrl: storeUrl.trim(),
                      chromeExtensionId: extensionId.trim(),
                    },
                  }),
                });
                setStatus("Chrome Web Store install link saved.");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Save failed");
              }
            }}
          >
            <h3 className="record-section-title">Add to Chrome listing</h3>
            <label className="block text-sm">
              <span className="text-[var(--neo-muted)]">Chrome Web Store URL</span>
              <input
                className="neo-input mt-1"
                type="url"
                value={storeUrl}
                onChange={(e) => setStoreUrl(e.target.value)}
                placeholder="https://chrome.google.com/webstore/detail/…"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--neo-muted)]">Extension ID</span>
              <input
                className="neo-input mt-1 font-mono text-xs"
                value={extensionId}
                onChange={(e) => setExtensionId(e.target.value)}
                placeholder="from the store URL or chrome://extensions"
              />
            </label>
            <button className="neo-btn" type="submit">
              Save listing
            </button>
          </form>

          <div className="border-t border-[var(--line)] pt-4">
            <h3 className="record-section-title">API keys</h3>
            <p className="mt-1 text-sm text-[var(--neo-muted)]">
              Optional keys for scripts and integrations. The Chrome extension
              uses your login instead — revoke any old extension keys here.
            </p>
            <form onSubmit={createKey} className="mt-3 flex flex-wrap gap-2">
              <input
                className="neo-input max-w-xs"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                placeholder="Integration name"
              />
              <button className="neo-btn neo-btn-primary" type="submit">
                Create API key
              </button>
            </form>
            {createdKey ? (
              <p className="mt-3 break-all rounded-xl bg-[var(--accent-soft)] p-3 text-sm">
                Copy now — shown once: <code>{createdKey}</code>
              </p>
            ) : null}
            <ul className="mt-3 space-y-2 text-sm">
              {keys.map((k) => (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-2"
                >
                  <span>
                    {k.name} · {k.key_prefix}…
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[var(--neo-muted)]">
                      {k.revoked_at ? "Revoked" : "Active"}
                    </span>
                    {!k.revoked_at ? (
                      <button
                        type="button"
                        className="neo-btn"
                        disabled={revokingKeyId === k.id}
                        onClick={() => void revokeKey(k.id)}
                      >
                        {revokingKeyId === k.id ? "Revoking…" : "Revoke"}
                      </button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-[var(--neo-muted)]">
            Store package (for Web Store upload):{" "}
            <a className="underline" href="/api/extension/download">
              Download zip
            </a>
          </p>
        </div>
      )}
    </>
  );
}

export default function SettingsPage() {
  return (
    <AppShell>
      <Suspense fallback={<p className="text-[var(--neo-muted)]">Loading settings…</p>}>
        <SettingsInner />
      </Suspense>
    </AppShell>
  );
}
