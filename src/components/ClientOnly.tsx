"use client";

import { useEffect, useState, type ReactNode } from "react";

/** Avoid SSR/client markup mismatches (e.g. Recharts sizing). */
export function ClientOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return <>{fallback}</>;
  return <>{children}</>;
}
