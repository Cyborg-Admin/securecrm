"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { QuickFab } from "@/components/QuickFab";

type MeResponse = {
  user: {
    id: string;
    full_name: string;
    email: string;
    roles: string[];
    permissions: string[];
  };
  organization: { name: string; slug: string };
};

const NAV = [
  { href: "/dashboard", label: "Dashboard", perm: "leads:read" },
  { href: "/reports", label: "Reports", perm: "leads:read" },
  { href: "/leads", label: "Leads", perm: "leads:read" },
  { href: "/contacts", label: "Contacts", perm: "contacts:read" },
  { href: "/companies", label: "Companies", perm: "companies:read" },
  { href: "/automations", label: "Automations", perm: "automations:read" },
  { href: "/team", label: "Team", perm: "users:read" },
  { href: "/settings", label: "Settings", perm: "settings:manage" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api<MeResponse>("/api/auth/me")
      .then(setMe)
      .catch(() => router.replace("/login"));
  }, [router]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const perms = new Set(me?.user.permissions || []);
  const initials =
    me?.user.full_name
      ?.split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "SC";

  return (
    <div className="min-h-screen md:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[272px] p-3 transition-transform duration-300 md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="shell-sidebar neo-raised flex h-full flex-col p-4">
          <div className="mb-7 fade-up px-1">
            <p className="display text-[1.7rem] text-[var(--accent)]">SecureCRM</p>
            <p className="mt-1 text-sm text-[var(--neo-muted)]">
              {me?.organization.name || "Loading workspace…"}
            </p>
          </div>

          <nav className="flex flex-1 flex-col gap-1.5">
            {NAV.filter((n) => perms.has(n.perm) || !me).map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-xl px-3 py-2.5 text-sm transition-all ${
                    active
                      ? "neo-pressed font-semibold text-[var(--accent-deep)]"
                      : "text-[var(--ink-soft)] hover:bg-white/70"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 space-y-2">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className={`neo-inset flex items-center gap-3 p-3 transition hover:border-[var(--accent)] ${
                pathname.startsWith("/profile") ? "neo-pressed" : ""
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent-deep)]">
                {initials}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">
                  {me?.user.full_name || "…"}
                </span>
                <span className="block truncate text-xs text-[var(--neo-muted)]">
                  {me?.user.roles?.join(" · ") || "Account"}
                </span>
              </span>
            </Link>
            <button className="neo-btn w-full text-sm" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <button
          className="fixed inset-0 z-30 bg-[rgba(20,32,28,0.28)] md:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 mx-3 mt-3 flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white/75 px-4 py-3 shadow-[var(--shadow-soft)] backdrop-blur-md md:mx-5 md:px-5">
          <button className="neo-btn md:hidden" onClick={() => setOpen(true)}>
            Menu
          </button>
          <div className="hidden md:block">
            <p className="page-kicker">Workspace</p>
            <p className="text-sm text-[var(--neo-muted)]">
              Security · Accountability · Automation
            </p>
          </div>
          <Link href="/profile" className="neo-btn text-sm">
            My profile
          </Link>
        </header>
        <main className="flex-1 px-4 pb-24 pt-5 md:px-6">{children}</main>
        <QuickFab />
      </div>
    </div>
  );
}
