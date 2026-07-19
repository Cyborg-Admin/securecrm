import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

/**
 * Server-side gate: protected UI is never rendered without a valid session.
 * Middleware also blocks missing cookies; this validates the session token.
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
  return <>{children}</>;
}
