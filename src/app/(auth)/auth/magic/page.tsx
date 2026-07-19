"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/client-api";

function MagicConsumeInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setError("Missing sign-in token.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await api("/api/auth/magic/consume", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        router.replace("/dashboard");
        router.refresh();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Sign-in failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="neo-raised w-full max-w-md p-8 text-center">
        <p className="display text-2xl text-[var(--accent-deep)]">SecureCRM</p>
        {error ? (
          <>
            <p className="mt-4 text-sm text-[var(--danger)]">{error}</p>
            <a href="/login" className="neo-btn neo-btn-primary mt-6 inline-block">
              Back to login
            </a>
          </>
        ) : (
          <p className="mt-4 text-sm text-[var(--neo-muted)]">
            Completing secure sign-in…
          </p>
        )}
      </div>
    </div>
  );
}

export default function MagicAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-[var(--neo-muted)]">
          Loading…
        </div>
      }
    >
      <MagicConsumeInner />
    </Suspense>
  );
}
