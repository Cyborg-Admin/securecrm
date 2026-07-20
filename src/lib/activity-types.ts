/** Canonical activity types shown in CRM + written by integrations. */
export const ACTIVITY_TYPES = [
  "note",
  "call",
  "meeting",
  "task",
  "email",
  "email_scanned",
  "linkedin",
  "other",
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  note: "Note",
  call: "Call",
  meeting: "Meeting",
  task: "Task",
  email: "Email",
  email_scanned: "Email",
  linkedin: "LinkedIn",
  other: "Other",
};

export function activityTypeLabel(type: string): string {
  if (type in ACTIVITY_TYPE_LABELS) {
    return ACTIVITY_TYPE_LABELS[type as ActivityType];
  }
  return type.replace(/_/g, " ");
}

/** Types users can log manually from the CRM UI. */
export const MANUAL_ACTIVITY_TYPES = [
  "note",
  "call",
  "meeting",
  "task",
  "email",
  "linkedin",
  "other",
] as const;
