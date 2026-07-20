"use client";

import { useState } from "react";

type Props = {
  label?: string;
  confirmLabel?: string;
  hint?: string;
  disabled?: boolean;
  onDelete: () => Promise<void>;
};

/** Two-step danger control for irreversible record deletes. */
export function DeleteRecordButton({
  label = "Delete",
  confirmLabel = "Confirm delete",
  hint,
  disabled,
  onDelete,
}: Props) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      await onDelete();
      setArmed(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {hint ? (
        <p className="text-xs text-[var(--neo-muted)]">{hint}</p>
      ) : null}
      {!armed ? (
        <button
          type="button"
          className="neo-btn w-full border-[var(--neo-danger)] text-[var(--neo-danger)]"
          disabled={disabled || busy}
          onClick={() => {
            setError(null);
            setArmed(true);
          }}
        >
          {label}
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="neo-btn neo-btn-primary flex-1 bg-[var(--neo-danger)] border-[var(--neo-danger)]"
            disabled={disabled || busy}
            onClick={() => void run()}
          >
            {busy ? "Deleting…" : confirmLabel}
          </button>
          <button
            type="button"
            className="neo-btn"
            disabled={busy}
            onClick={() => setArmed(false)}
          >
            Cancel
          </button>
        </div>
      )}
      {error ? (
        <p className="text-sm text-[var(--neo-danger)]">{error}</p>
      ) : null}
    </div>
  );
}
