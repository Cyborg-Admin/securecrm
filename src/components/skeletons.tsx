import type { CSSProperties } from "react";

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return <span className={`skeleton ${className}`} style={style} aria-hidden />;
}

export function PageHeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-10 w-28 rounded-xl" />
    </div>
  );
}

export function RecordRowSkeleton() {
  return (
    <li className="neo-inset rounded-2xl p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56 max-w-full" />
        </div>
        <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
      </div>
      <Skeleton className="mt-2 h-3 w-32" />
    </li>
  );
}

export function RecordListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="mt-4 space-y-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <RecordRowSkeleton key={i} />
      ))}
    </ul>
  );
}

export function PageListSkeleton() {
  return (
    <div className="page-enter">
      <PageHeaderSkeleton />
      <section className="neo-raised mt-5 p-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <RecordListSkeleton />
      </section>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="page-enter space-y-5">
      <PageHeaderSkeleton />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="neo-raised p-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="mt-3 h-8 w-20" />
          </div>
        ))}
      </div>
      <div className="neo-raised p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-48 w-full rounded-xl" />
      </div>
    </div>
  );
}

/** Full-shell placeholder used only on first session verify. */
export function AppShellSkeleton() {
  return (
    <div className="app-shell" aria-busy="true" aria-label="Loading workspace">
      <aside className="shell-nav" aria-hidden>
        <div className="shell-nav-inner">
          <div className="shell-brand px-2 py-2">
            <Skeleton className="h-6 w-28" />
          </div>
          <nav className="shell-nav-scroll space-y-4 px-2 pt-4">
            {Array.from({ length: 3 }, (_, g) => (
              <div key={g} className="space-y-2">
                <Skeleton className="h-3 w-16" />
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-9 w-full rounded-xl" />
                ))}
              </div>
            ))}
          </nav>
        </div>
      </aside>
      <div className="shell-main">
        <header className="shell-topbar">
          <div className="shell-topbar-left min-w-0 flex-1">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="shell-topbar-actions">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
        </header>
        <main className="shell-content">
          <PageListSkeleton />
        </main>
      </div>
    </div>
  );
}
