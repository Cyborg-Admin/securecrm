"use client";

import { FormEvent, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client-api";

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(
    token ? null : "Missing reset token. Request a new link from the login page.",
  );
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({ token, newPassword: password }),
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        className="pointer-events-none absolute -left-20 top-0 h-80 w-80 rounded-full opacity-70"
        style={{
          background:
            "radial-gradient(circle, rgba(13,122,95,.22), transparent 70%)",
        }}
      />
      <div className="neo-raised relative w-full max-w-md fade-up p-8">
        <p className="page-kicker">Account recovery</p>
        <p className="brand-type mt-1 text-3xl font-bold text-[var(--accent-deep)]">
          Kinetic
        </p>
        <p className="mt-4 text-[var(--neo-muted)]">
          Choose a new password. You do not need your old password.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm">
            <span className="text-[var(--neo-muted)]">New password (10+ chars)</span>
            <input
              className="neo-input mt-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={10}
              autoComplete="new-password"
              disabled={!token}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--neo-muted)]">Confirm password</span>
            <input
              className="neo-input mt-2"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={10}
              autoComplete="new-password"
              disabled={!token}
            />
          </label>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <button
            className="neo-btn neo-btn-primary w-full"
            disabled={loading || !token}
          >
            {loading ? "Saving…" : "Set password and continue"}
          </button>
        </form>

        <a
          href="/login"
          className="mt-6 inline-block text-sm text-[var(--neo-muted)] underline"
        >
          Back to login
        </a>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-[var(--neo-muted)]">
          Loading…
        </div>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
