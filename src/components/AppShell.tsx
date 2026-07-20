"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { NotificationCenter } from "@/components/NotificationCenter";
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
  features?: Record<string, boolean>;
  appVersion?: string;
};

type NavItem = {
  href: string;
  label: string;
  perm: string;
  feature?: string;
  icon:
    | "home"
    | "chart"
    | "leads"
    | "contacts"
    | "company"
    | "product"
    | "opp"
    | "event"
    | "bolt"
    | "team"
    | "gear"
    | "extension";
};

type NavGroup = { id: string; label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard", perm: "leads:read", icon: "home" },
      {
        href: "/reports",
        label: "Reports",
        perm: "leads:read",
        feature: "reports",
        icon: "chart",
      },
    ],
  },
  {
    id: "pipeline",
    label: "Pipeline",
    items: [
      {
        href: "/leads",
        label: "Leads",
        perm: "leads:read",
        feature: "leads",
        icon: "leads",
      },
      {
        href: "/contacts",
        label: "Contacts",
        perm: "contacts:read",
        feature: "contacts",
        icon: "contacts",
      },
      {
        href: "/companies",
        label: "Companies",
        perm: "companies:read",
        feature: "companies",
        icon: "company",
      },
      {
        href: "/products",
        label: "Products",
        perm: "products:read",
        feature: "products",
        icon: "product",
      },
      {
        href: "/opportunities",
        label: "Opportunities",
        perm: "opportunities:read",
        feature: "opportunities",
        icon: "opp",
      },
      {
        href: "/events",
        label: "Events",
        perm: "events:read",
        feature: "events",
        icon: "event",
      },
    ],
  },
  {
    id: "ops",
    label: "Operations",
    items: [
      {
        href: "/automations",
        label: "Automations",
        perm: "automations:read",
        feature: "automations",
        icon: "bolt",
      },
      {
        href: "/team",
        label: "Team",
        perm: "users:read",
        feature: "team",
        icon: "team",
      },
      {
        href: "/extension",
        label: "Extension",
        perm: "extension:capture",
        feature: "extension",
        icon: "extension",
      },
      {
        href: "/settings",
        label: "Settings",
        perm: "settings:manage",
        icon: "gear",
      },
    ],
  },
];

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Dashboard", subtitle: "Pipeline pulse and ownership" },
  "/reports": { title: "Reports", subtitle: "Trends across your workspace" },
  "/leads": { title: "Leads", subtitle: "Capture and qualify prospects" },
  "/contacts": { title: "Contacts", subtitle: "People you’re engaging" },
  "/companies": { title: "Companies", subtitle: "Accounts and related records" },
  "/products": { title: "Products", subtitle: "Catalogue of what you sell" },
  "/opportunities": {
    title: "Opportunities",
    subtitle: "Deals linked to companies and contacts",
  },
  "/events": {
    title: "Events",
    subtitle: "Registrations for sales and delegates",
  },
  "/automations": { title: "Automations", subtitle: "Rules that keep work moving" },
  "/team": { title: "Team", subtitle: "People and access" },
  "/extension": {
    title: "Extension",
    subtitle: "Install KINETIC in Chrome",
  },
  "/settings": { title: "Settings", subtitle: "Workspace administration" },
  "/profile": { title: "Profile", subtitle: "Your account and security" },
};

const COLLAPSE_KEY = "kinetic.nav.collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  useEffect(() => {
    let cancelled = false;
    api<MeResponse>("/api/auth/me")
      .then((data) => {
        if (!cancelled) {
          setMe(data);
          setReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMe(null);
          setReady(false);
          router.replace("/login");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const page = useMemo(() => {
    const hit = Object.entries(PAGE_META).find(([path]) =>
      pathname.startsWith(path),
    );
    return hit?.[1] || { title: "KINETIC", subtitle: "Workspace" };
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  if (!ready || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[var(--neo-muted)]">Verifying session…</p>
      </div>
    );
  }

  const perms = new Set(me.user.permissions || []);
  const features = me.features || {};
  const initials =
    me.user.full_name
      ?.split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "K";

  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((n) => {
      if (!perms.has(n.perm)) return false;
      if (n.feature && features[n.feature] === false) return false;
      return true;
    }),
  })).filter((g) => g.items.length);

  return (
    <div
      className={`app-shell ${collapsed ? "is-collapsed" : ""} ${
        mobileOpen ? "is-mobile-open" : ""
      }`}
    >
      <aside className="shell-nav" aria-label="Primary">
        <div className="shell-nav-inner">
          <div className="shell-brand">
            <Link href="/dashboard" className="shell-brand-mark" title="Kinetic">
              <span className="shell-brand-text">
                <span className="shell-brand-name">Kinetic</span>
                <span className="shell-brand-org">{me.organization.name}</span>
              </span>
            </Link>
            <button
              type="button"
              className="shell-collapse-btn"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              title={collapsed ? "Expand" : "Collapse"}
            >
              <CollapseIcon collapsed={collapsed} />
            </button>
          </div>

          <nav className="shell-nav-scroll">
            {groups.map((group) => (
              <div key={group.id} className="shell-nav-group">
                <p className="shell-nav-label">{group.label}</p>
                <ul>
                  {group.items.map((item) => {
                    const active = pathname.startsWith(item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={`shell-nav-link ${active ? "is-active" : ""}`}
                          title={item.label}
                          onClick={() => setMobileOpen(false)}
                        >
                          <NavIcon name={item.icon} />
                          <span className="shell-nav-link-text">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="shell-nav-foot">
            <Link
              href="/profile"
              className={`shell-user-chip ${
                pathname.startsWith("/profile") ? "is-active" : ""
              }`}
              title={me.user.full_name}
              onClick={() => setMobileOpen(false)}
            >
              <span className="shell-avatar">{initials}</span>
              <span className="shell-user-meta">
                <span className="shell-user-name">{me.user.full_name}</span>
                <span className="shell-user-role">
                  {me.user.roles?.[0] || "Member"}
                </span>
              </span>
            </Link>
          </div>
        </div>
      </aside>

      {mobileOpen ? (
        <button
          type="button"
          className="shell-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="shell-main">
        <header className="shell-topbar">
          <div className="shell-topbar-left">
            <button
              type="button"
              className="shell-icon-btn shell-mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <MenuIcon />
            </button>
            <div className="shell-page-meta min-w-0">
              <p className="shell-context-org">{me.organization.name}</p>
              <p className="shell-context-page">
                <span>{page.title}</span>
                <span className="shell-context-sep" aria-hidden>
                  ·
                </span>
                <span className="shell-context-sub">{page.subtitle}</span>
              </p>
            </div>
          </div>

          <div className="shell-topbar-actions">
            <NotificationCenter />
            <div className="shell-account" ref={accountRef}>
              <button
                type="button"
                className="shell-account-btn"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen((v) => !v)}
              >
                <span className="shell-avatar sm">{initials}</span>
                <span className="shell-account-name">{me.user.full_name}</span>
                <ChevronIcon />
              </button>
              {menuOpen ? (
                <div className="shell-account-menu" role="menu">
                  <p className="shell-account-email">{me.user.email}</p>
                  {me.appVersion ? (
                    <p className="shell-account-email">v{me.appVersion}</p>
                  ) : null}
                  <Link
                    href="/profile"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    Profile & security
                  </Link>
                  {perms.has("settings:manage") ? (
                    <Link
                      href="/settings"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                    >
                      Workspace settings
                    </Link>
                  ) : null}
                  <button type="button" role="menuitem" onClick={() => void logout()}>
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="shell-content">{children}</main>
        <QuickFab />
      </div>
    </div>
  );
}

function NavIcon({ name }: { name: NavItem["icon"] }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true as const,
  };
  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path
            d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "chart":
      return (
        <svg {...common}>
          <path
            d="M4 19h16M7 16V9m5 7V5m5 11v-4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    case "leads":
      return (
        <svg {...common}>
          <path
            d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M19 8v6m3-3h-6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    case "contacts":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M5 20a7 7 0 0 1 14 0"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    case "company":
      return (
        <svg {...common}>
          <path
            d="M4 20V6.5A1.5 1.5 0 0 1 5.5 5H11v15H4Zm8 0V9h6.5A1.5 1.5 0 0 1 21 10.5V20h-9Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path
            d="M13 3 5 14h6l-1 7 9-12h-6l0-6Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M3.5 19a5.5 5.5 0 0 1 11 0M14 19a4 4 0 0 1 6.5-3.1"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    case "extension":
      return (
        <svg {...common}>
          <path
            d="M8 4v2.5M16 4v2.5M6.5 8.5h11A1.5 1.5 0 0 1 19 10v3.2a2.8 2.8 0 0 0-2.2 2.7V18a2 2 0 0 1-2 2h-5.6a2 2 0 0 1-2-2v-2.1A2.8 2.8 0 0 0 5 13.2V10a1.5 1.5 0 0 1 1.5-1.5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "product":
      return (
        <svg {...common}>
          <path
            d="M4 8.5 12 4l8 4.5V16l-8 4.5L4 16V8.5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="M12 12v8.5M4 8.5l8 3.5 8-3.5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "opp":
      return (
        <svg {...common}>
          <path
            d="M4 19V5h10l6 7-6 7H4Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "event":
      return (
        <svg {...common}>
          <rect
            x="3.5"
            y="5"
            width="17"
            height="15"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <path
            d="M3.5 10h17M8 3.5v3m8-3v3"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    case "gear":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M12 3.5v2.2m0 12.6v2.2M3.5 12h2.2m12.6 0h2.2m-14-5.5 1.6 1.6m11.2 11.2 1.6 1.6m0-14.4-1.6 1.6M6.7 16.7 5.1 18.3"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

function CollapseIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 10l5 5 5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
