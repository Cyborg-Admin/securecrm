"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/client-api";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

function formatWhen(value: string) {
  try {
    const d = new Date(value);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return "Just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api<{
        notifications: Notification[];
        unreadCount: number;
      }>("/api/notifications?limit=25");
      setItems(data.notifications);
      setUnread(data.unreadCount);
    } catch {
      /* ignore transient poll errors */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAll() {
    setLoading(true);
    try {
      const res = await api<{ unreadCount: number }>("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ all: true }),
      });
      setUnread(res.unreadCount);
      setItems((prev) =>
        prev.map((n) => ({
          ...n,
          read_at: n.read_at || new Date().toISOString(),
        })),
      );
    } finally {
      setLoading(false);
    }
  }

  async function openItem(n: Notification) {
    if (!n.read_at) {
      try {
        const res = await api<{ unreadCount: number }>("/api/notifications", {
          method: "PATCH",
          body: JSON.stringify({ ids: [n.id] }),
        });
        setUnread(res.unreadCount);
        setItems((prev) =>
          prev.map((x) =>
            x.id === n.id
              ? { ...x, read_at: x.read_at || new Date().toISOString() }
              : x,
          ),
        );
      } catch {
        /* best effort */
      }
    }
    setOpen(false);
  }

  return (
    <div className="notif-root" ref={rootRef}>
      <button
        type="button"
        className="shell-icon-btn"
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refresh();
        }}
      >
        <BellIcon />
        {unread > 0 ? (
          <span className="notif-badge">{unread > 99 ? "99+" : unread}</span>
        ) : null}
      </button>

      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">
            <p className="font-semibold">Notifications</p>
            <button
              type="button"
              className="notif-mark-all"
              disabled={loading || unread === 0}
              onClick={() => void markAll()}
            >
              Mark all read
            </button>
          </div>
          <ul className="notif-list">
            {items.length ? (
              items.map((n) => (
                <li key={n.id}>
                  {n.href ? (
                    <Link
                      href={n.href}
                      className={`notif-item ${n.read_at ? "" : "is-unread"}`}
                      onClick={() => void openItem(n)}
                    >
                      <NotificationBody n={n} />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      className={`notif-item ${n.read_at ? "" : "is-unread"}`}
                      onClick={() => void openItem(n)}
                    >
                      <NotificationBody n={n} />
                    </button>
                  )}
                </li>
              ))
            ) : (
              <li className="notif-empty">You’re all caught up.</li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function NotificationBody({ n }: { n: Notification }) {
  return (
    <>
      <span className="notif-item-top">
        <span className="notif-title">{n.title}</span>
        <span className="notif-time">{formatWhen(n.created_at)}</span>
      </span>
      {n.body ? <span className="notif-body">{n.body}</span> : null}
    </>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 9a6 6 0 1 1 12 0c0 3.5 1.2 5 2 6H4c.8-1 2-2.5 2-6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10 19a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
