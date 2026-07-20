"use client";

import { FormEvent, useEffect, useState } from "react";
import { RecordListSkeleton } from "@/components/skeletons";
import { api } from "@/lib/client-api";

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  roles: string | null;
  is_active: number;
  last_login_at: string | null;
};

export default function TeamPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [roleName, setRoleName] = useState("Rep");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await api<{ users: UserRow[] }>("/api/users");
    setUsers(data.users);
  }

  useEffect(() => {
    void load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/users", {
        method: "POST",
        body: JSON.stringify({ email, fullName, password, roleName }),
      });
      setEmail("");
      setFullName("");
      setPassword("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <>
      <h1 className="display text-3xl">Team & roles</h1>
      <p className="mt-1 text-[var(--neo-muted)]">
        Role-based privileges sit at the heart of every mutation.
      </p>

      <form
        onSubmit={onCreate}
        className="neo-raised mt-5 grid gap-3 p-4 md:grid-cols-2"
      >
        <input
          className="neo-input"
          placeholder="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
        <input
          className="neo-input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="neo-input"
          type="password"
          placeholder="Temp password (10+ chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={10}
        />
        <select
          className="neo-input"
          value={roleName}
          onChange={(e) => setRoleName(e.target.value)}
        >
          <option>Admin</option>
          <option>Manager</option>
          <option>Rep</option>
          <option>Viewer</option>
        </select>
        <button className="neo-btn neo-btn-primary md:col-span-2">
          Invite user
        </button>
      </form>
      {error ? (
        <p className="mt-2 text-sm text-[var(--neo-danger)]">{error}</p>
      ) : null}

      {loading ? (
        <RecordListSkeleton rows={4} />
      ) : (
        <ul className="mt-5 space-y-3">
          {users.map((u) => (
            <li
              key={u.id}
              className="neo-raised flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <div>
                <p className="font-medium">{u.full_name}</p>
                <p className="text-sm text-[var(--neo-muted)]">{u.email}</p>
              </div>
              <div className="text-right text-sm">
                <p>{u.roles || "No role"}</p>
                <p className="text-[var(--neo-muted)]">
                  {u.is_active ? "Active" : "Disabled"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
