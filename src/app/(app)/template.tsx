"use client";

import type { ReactNode } from "react";

/** Remounts per navigation for a short enter animation; AppShell stays in layout. */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
