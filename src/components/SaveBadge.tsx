"use client";

export function SaveBadge({
  status,
  error,
}: {
  status: "idle" | "saving" | "saved" | "error";
  error?: string | null;
}) {
  if (status === "idle") return null;
  const label =
    status === "saving"
      ? "Saving…"
      : status === "saved"
        ? "Saved"
        : error || "Error";
  return (
    <span
      className={`save-pulse rounded-full px-3 py-1 text-xs ${
        status === "error"
          ? "bg-rose-50 text-[var(--danger)]"
          : "bg-[var(--accent-soft)] text-[var(--accent-deep)]"
      }`}
    >
      {label}
    </span>
  );
}
