"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/client-api";

type ProfileResponse = {
  profile: {
    id: string;
    email: string;
    full_name: string;
    last_login_at: string | null;
    created_at: string;
    hasPassword: boolean;
    roles: string[];
    permissions: string[];
  };
  organization: { id: string; name: string; slug: string } | null;
};

export default function ProfilePage() {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetSending, setResetSending] = useState(false);

  const hasPassword = data?.profile.hasPassword ?? true;

  useEffect(() => {
    api<ProfileResponse>("/api/profile")
      .then((res) => {
        setData(res);
        setFullName(res.profile.full_name);
        setEmail(res.profile.email);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"));
  }, []);

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api<{ profile: ProfileResponse["profile"] }>("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ fullName, email }),
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              profile: { ...prev.profile, ...res.profile },
            }
          : prev,
      );
      setMessage("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await api("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          ...(hasPassword ? { currentPassword } : {}),
          newPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setData((prev) =>
        prev
          ? { ...prev, profile: { ...prev.profile, hasPassword: true } }
          : prev,
      );
      setMessage(hasPassword ? "Password updated." : "Password set. You can sign in with it next time.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password update failed");
    } finally {
      setSaving(false);
    }
  }

  async function onEmailResetLink() {
    if (!data?.profile.email) return;
    setResetSending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api<{ message: string }>("/api/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email: data.profile.email }),
      });
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset link");
    } finally {
      setResetSending(false);
    }
  }

  return (
    <>
      <div>
        <p className="page-kicker">Account</p>
        <h1 className="display mt-1 text-3xl md:text-4xl">My profile</h1>
        <p className="mt-2 text-[var(--neo-muted)]">
          Manage your identity, credentials, and workspace membership.
        </p>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="neo-raised p-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-soft)] display text-2xl text-[var(--accent-deep)]">
            {(data?.profile.full_name || "SC")
              .split(/\s+/)
              .slice(0, 2)
              .map((p) => p[0]?.toUpperCase())
              .join("")}
          </div>
          <p className="display mt-4 text-2xl">{data?.profile.full_name || "…"}</p>
          <p className="text-sm text-[var(--neo-muted)]">{data?.profile.email}</p>
          <div className="neo-inset mt-4 space-y-2 p-3 text-sm">
            <p>
              <span className="text-[var(--neo-muted)]">Workspace</span>
              <br />
              {data?.organization?.name || "—"}
            </p>
            <p>
              <span className="text-[var(--neo-muted)]">Roles</span>
              <br />
              {data?.profile.roles?.join(", ") || "—"}
            </p>
            <p>
              <span className="text-[var(--neo-muted)]">Password</span>
              <br />
              {data
                ? hasPassword
                  ? "Set"
                  : "Not set (magic-link account)"
                : "—"}
            </p>
            <p>
              <span className="text-[var(--neo-muted)]">Last login</span>
              <br />
              {data?.profile.last_login_at
                ? data.profile.last_login_at.slice(0, 19).replace("T", " ")
                : "—"}
            </p>
          </div>
        </section>

        <div className="space-y-4">
          <form onSubmit={onSaveProfile} className="neo-raised space-y-3 p-5">
            <h2 className="display text-xl">Profile details</h2>
            <label className="block text-sm">
              <span className="text-[var(--neo-muted)]">Full name</span>
              <input
                className="neo-input mt-1"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--neo-muted)]">Email</span>
              <input
                className="neo-input mt-1"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <button className="neo-btn neo-btn-primary" disabled={saving}>
              Save profile
            </button>
          </form>

          <form onSubmit={onChangePassword} className="neo-raised space-y-3 p-5">
            <h2 className="display text-xl">
              {hasPassword ? "Password" : "Set a password"}
            </h2>
            {!hasPassword && (
              <p className="text-sm text-[var(--neo-muted)]">
                This account was created for magic-link sign-in, so there is no
                current password. Choose one below, or email yourself a reset
                link.
              </p>
            )}
            {hasPassword && (
              <label className="block text-sm">
                <span className="text-[var(--neo-muted)]">Current password</span>
                <input
                  className="neo-input mt-1"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </label>
            )}
            <label className="block text-sm">
              <span className="text-[var(--neo-muted)]">
                {hasPassword ? "New password (10+ chars)" : "Password (10+ chars)"}
              </span>
              <input
                className="neo-input mt-1"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={10}
                autoComplete="new-password"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button className="neo-btn neo-btn-primary" disabled={saving}>
                {hasPassword ? "Update password" : "Set password"}
              </button>
              <button
                type="button"
                className="neo-btn"
                disabled={resetSending || !data?.profile.email}
                onClick={() => void onEmailResetLink()}
              >
                {resetSending ? "Sending…" : "Email reset link"}
              </button>
            </div>
          </form>

          {message && <p className="text-sm text-[var(--accent-deep)]">{message}</p>}
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>
      </div>
    </>
  );
}
