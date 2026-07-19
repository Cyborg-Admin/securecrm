"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { QuickCreateModal, type QuickCreateKind } from "@/components/QuickCreateModal";

const ACTIONS: Array<{
  id: string;
  label: string;
  kind?: QuickCreateKind;
  href?: string;
}> = [
  { id: "lead", label: "New lead", kind: "lead" },
  { id: "contact", label: "New contact", kind: "contact" },
  { id: "leads", label: "Leads", href: "/leads" },
  { id: "contacts", label: "Contacts", href: "/contacts" },
  { id: "companies", label: "Companies", href: "/companies" },
];

export function QuickFab() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [createKind, setCreateKind] = useState<QuickCreateKind | null>(null);

  return (
    <>
      <div className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2">
        {open && (
          <div className="flex flex-col gap-2 fade-up">
            {ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                className="neo-btn min-w-[140px] justify-start bg-white text-sm"
                onClick={() => {
                  if (action.kind) {
                    setCreateKind(action.kind);
                    setOpen(false);
                    return;
                  }
                  if (action.href) {
                    router.push(action.href);
                    setOpen(false);
                  }
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="neo-btn neo-btn-primary h-14 w-14 text-xl"
          aria-expanded={open}
          aria-label={open ? "Close quick actions" : "Open quick actions"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "×" : "+"}
        </button>
      </div>

      {createKind && (
        <QuickCreateModal
          kind={createKind}
          onClose={() => setCreateKind(null)}
          onCreated={(id) => {
            router.push(createKind === "lead" ? `/leads?open=${id}` : `/contacts?open=${id}`);
          }}
        />
      )}
    </>
  );
}
