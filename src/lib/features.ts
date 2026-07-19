export const FEATURE_KEYS = [
  "leads",
  "contacts",
  "companies",
  "opportunities",
  "events",
  "automations",
  "reports",
  "extension",
  "team",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type OrgFeatures = Record<FeatureKey, boolean>;

export const DEFAULT_FEATURES: OrgFeatures = {
  leads: true,
  contacts: true,
  companies: true,
  opportunities: true,
  events: true,
  automations: true,
  reports: true,
  extension: true,
  team: true,
};

export function parseFeatures(raw: unknown): OrgFeatures {
  const base = { ...DEFAULT_FEATURES };
  if (!raw || typeof raw !== "object") return base;
  for (const key of FEATURE_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "boolean") base[key] = v;
  }
  return base;
}

export type OrgSettings = {
  timezone: string;
  currency: string;
  opportunityApproval: {
    enabled: boolean;
    /** Stage IDs that require approval before enter */
    requireApprovalStageIds: string[];
    /** User IDs allowed to approve (empty = any Admin with opportunities:approve) */
    approverUserIds: string[];
  };
};

export const DEFAULT_ORG_SETTINGS: OrgSettings = {
  timezone: "Europe/London",
  currency: "GBP",
  opportunityApproval: {
    enabled: true,
    requireApprovalStageIds: [],
    approverUserIds: [],
  },
};

export function parseOrgSettings(raw: unknown): OrgSettings {
  const base: OrgSettings = {
    ...DEFAULT_ORG_SETTINGS,
    opportunityApproval: { ...DEFAULT_ORG_SETTINGS.opportunityApproval },
  };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  if (typeof o.timezone === "string") base.timezone = o.timezone;
  if (typeof o.currency === "string") base.currency = o.currency;
  if (o.opportunityApproval && typeof o.opportunityApproval === "object") {
    const a = o.opportunityApproval as Record<string, unknown>;
    if (typeof a.enabled === "boolean") base.opportunityApproval.enabled = a.enabled;
    if (Array.isArray(a.requireApprovalStageIds)) {
      base.opportunityApproval.requireApprovalStageIds = a.requireApprovalStageIds
        .filter((x): x is string => typeof x === "string");
    }
    if (Array.isArray(a.approverUserIds)) {
      base.opportunityApproval.approverUserIds = a.approverUserIds.filter(
        (x): x is string => typeof x === "string",
      );
    }
  }
  return base;
}
