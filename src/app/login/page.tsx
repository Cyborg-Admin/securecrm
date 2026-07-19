"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("ChangeMeNow!23");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        className="pointer-events-none absolute -left-20 top-0 h-80 w-80 rounded-full opacity-70"
        style={{ background: "radial-gradient(circle, rgba(13,122,95,.22), transparent 70%)" }}
      />
      <div
        className="pointer-events-none absolute -right-16 bottom-0 h-96 w-96 rounded-full opacity-60"
        style={{ background: "radial-gradient(circle, rgba(180,83,9,.14), transparent 70%)" }}
      />

      <form onSubmit={onSubmit} className="neo-raised relative w-full max-w-md fade-up p-8">
        <p className="page-kicker">Secure workspace</p>
        <p className="display mt-2 text-4xl text-[var(--accent-deep)]">SecureCRM</p>
        <p className="mt-2 text-[var(--neo-muted)]">
          Multi-user CRM with RBAC, audit trails, and capture automation.
        </p>

        <label className="mt-8 block text-sm text-[var(--neo-muted)]">Email</label>
        <input
          className="neo-input mt-2"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="username"
        />

        <label className="mt-4 block text-sm text-[var(--neo-muted)]">Password</label>
        <input
          className="neo-input mt-2"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}

        <button className="neo-btn neo-btn-primary mt-6 w-full" disabled={loading}>
          {loading ? "Signing in…" : "Enter workspace"}
        </button>
      </form>
    </div>
  );
}
