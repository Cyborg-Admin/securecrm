import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getSessionUser } from "@/lib/auth";

/**
 * Server-side gate + persistent shell so nav/session do not remount on every route.
 */
export default async function ProtectedAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return <AppShell>{children}</AppShell>;
}
