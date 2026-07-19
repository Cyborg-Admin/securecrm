"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";

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
  { href: "/leads", label: "Leads", perm: "leads:read" },
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

  return (
    <div className="min-h-screen md:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[260px] p-4 transition-transform duration-300 md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="neo-raised flex h-full flex-col p-4">
          <div className="mb-6 fade-up">
            <p className="display text-2xl text-black">SecureCRM</p>
            <p className="mt-1 text-sm text-[var(--neo-muted)]">
              {me?.organization.name || "Loading workspace…"}
            </p>
          </div>

          <nav className="flex flex-1 flex-col gap-2">
            {NAV.filter((n) => perms.has(n.perm) || !me).map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-2xl px-3 py-2.5 text-sm transition-all ${
                    active ? "neo-pressed font-semibold text-[var(--neo-accent)]" : "hover:neo-pressed"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="neo-inset mt-4 p-3 text-sm">
            <p className="font-medium">{me?.user.full_name || "…"}</p>
            <p className="text-[var(--neo-muted)]">{me?.user.roles?.join(", ")}</p>
            <button className="neo-btn mt-3 w-full text-sm" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {open && (
        <button
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-[var(--line)] bg-white px-4 py-3 md:px-6">
          <button className="neo-btn md:hidden" onClick={() => setOpen(true)}>
            Menu
          </button>
          <div className="hidden md:block">
            <p className="text-sm text-[var(--neo-muted)]">Security · Accountability · Automation</p>
          </div>
          <div className="border border-[var(--line)] px-3 py-2 text-xs text-[var(--neo-muted)]">
            Dynamic workspace
          </div>
        </header>
        <main className="flex-1 px-4 pb-8 md:px-6">{children}</main>
      </div>
    </div>
  );
}
