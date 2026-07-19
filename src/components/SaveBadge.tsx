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
    <span className="save-pulse border border-black bg-white px-3 py-1 text-xs text-black">
      {label}
    </span>
  );
}
