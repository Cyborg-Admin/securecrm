"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client-api";

type Mode = "magic" | "password" | "forgot";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("magic");
  const [email, setEmail] = useState("louis@cyborggroup.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
    setDevLink(null);
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function onMagic(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    setDevLink(null);
    try {
      const res = await api<{
        message: string;
        mailed?: boolean;
        devMagicUrl?: string;
      }>("/api/auth/magic/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setInfo(res.message);
      if (res.devMagicUrl) setDevLink(res.devMagicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send link");
    } finally {
      setLoading(false);
    }
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    setDevLink(null);
    try {
      const res = await api<{
        message: string;
        mailed?: boolean;
        devResetUrl?: string;
      }>("/api/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setInfo(res.message);
      if (res.devResetUrl) setDevLink(res.devResetUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset link");
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
      <div
        className="pointer-events-none absolute -right-16 bottom-0 h-96 w-96 rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(circle, rgba(180,83,9,.14), transparent 70%)",
        }}
      />

      <div className="neo-raised relative w-full max-w-md fade-up p-8">
        <div>
          <p className="page-kicker">CRM workspace</p>
          <p className="brand-type mt-1 text-3xl font-bold text-[var(--accent-deep)]">
            Kinetic
          </p>
        </div>
        <p className="mt-4 text-[var(--neo-muted)]">
          {mode === "forgot"
            ? "We’ll email a link so you can set a password — even if your account never had one."
            : "Sign in with a magic link. Password is optional for accounts that have one."}
        </p>

        {mode !== "forgot" && (
          <div className="mt-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`neo-btn text-sm ${mode === "magic" ? "neo-btn-primary" : ""}`}
              onClick={() => switchMode("magic")}
            >
              Magic link
            </button>
            <button
              type="button"
              className={`neo-btn text-sm ${mode === "password" ? "neo-btn-primary" : ""}`}
              onClick={() => switchMode("password")}
            >
              Password
            </button>
          </div>
        )}

        {mode === "magic" ? (
          <form onSubmit={onMagic} className="mt-6">
            <label className="block text-sm text-[var(--neo-muted)]">Email</label>
            <input
              className="neo-input mt-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
            {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
            {info && <p className="mt-4 text-sm text-[var(--accent-deep)]">{info}</p>}
            {devLink && (
              <p className="mt-3 break-all text-xs text-[var(--neo-muted)]">
                Dev link (email not configured):{" "}
                <a className="underline" href={devLink}>
                  Open magic link
                </a>
              </p>
            )}
            <button
              className="neo-btn neo-btn-primary mt-6 w-full"
              disabled={loading}
            >
              {loading ? "Sending…" : "Email me a sign-in link"}
            </button>
            <button
              type="button"
              className="mt-4 w-full text-sm text-[var(--neo-muted)] underline"
              onClick={() => switchMode("forgot")}
            >
              Forgot password?
            </button>
          </form>
        ) : mode === "password" ? (
          <form onSubmit={onPassword} className="mt-6">
            <label className="block text-sm text-[var(--neo-muted)]">Email</label>
            <input
              className="neo-input mt-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
            <label className="mt-4 block text-sm text-[var(--neo-muted)]">
              Password
            </label>
            <input
              className="neo-input mt-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              minLength={8}
            />
            {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
            <button
              className="neo-btn neo-btn-primary mt-6 w-full"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Enter workspace"}
            </button>
            <button
              type="button"
              className="mt-4 w-full text-sm text-[var(--neo-muted)] underline"
              onClick={() => switchMode("forgot")}
            >
              Forgot password?
            </button>
          </form>
        ) : (
          <form onSubmit={onForgot} className="mt-6">
            <label className="block text-sm text-[var(--neo-muted)]">Email</label>
            <input
              className="neo-input mt-2"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
            {error && <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>}
            {info && <p className="mt-4 text-sm text-[var(--accent-deep)]">{info}</p>}
            {devLink && (
              <p className="mt-3 break-all text-xs text-[var(--neo-muted)]">
                Dev link (email not configured):{" "}
                <a className="underline" href={devLink}>
                  Open reset link
                </a>
              </p>
            )}
            <button
              className="neo-btn neo-btn-primary mt-6 w-full"
              disabled={loading}
            >
              {loading ? "Sending…" : "Email me a reset link"}
            </button>
            <button
              type="button"
              className="mt-4 w-full text-sm text-[var(--neo-muted)] underline"
              onClick={() => switchMode("password")}
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
