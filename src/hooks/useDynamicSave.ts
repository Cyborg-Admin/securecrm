"use client";

import { useEffect, useRef, useState, useEffectEvent } from "react";

type Status = "idle" | "saving" | "saved" | "error";

export function useDynamicSave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  delayMs = 650,
  enabled = true,
) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const first = useRef(true);
  const latest = useRef(value);
  latest.current = value;

  const onSave = useEffectEvent(async (next: T) => {
    setStatus("saving");
    setError(null);
    try {
      await save(next);
      setStatus("saved");
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Save failed");
    }
  });

  useEffect(() => {
    if (!enabled) return;
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      void onSave(latest.current);
    }, delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs, enabled]);

  return { status, error };
}
