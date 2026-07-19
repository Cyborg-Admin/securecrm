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
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md fade-up border border-[var(--line)] p-8">
        <p className="display text-4xl text-black">SecureCRM</p>
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

        {error && (
          <p className="mt-4 text-sm text-black underline decoration-neutral-400">{error}</p>
        )}

        <button className="neo-btn neo-btn-primary mt-6 w-full" disabled={loading}>
          {loading ? "Signing in…" : "Enter workspace"}
        </button>

        <p className="mt-5 text-xs text-[var(--neo-muted)]">
          Default bootstrap: admin@example.com / ChangeMeNow!23
        </p>
      </form>
    </div>
  );
}
