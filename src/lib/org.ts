import { getDbAsync } from "@/lib/db";
import {
  DEFAULT_FEATURES,
  DEFAULT_ORG_SETTINGS,
  parseFeatures,
  parseOrgSettings,
  type OrgFeatures,
  type OrgSettings,
} from "@/lib/features";
import { parseJsonObject } from "@/lib/json";

export type OrgRow = {
  id: string;
  name: string;
  slug: string;
  settings_json?: string | Record<string, unknown>;
  features_json?: string | Record<string, unknown>;
};

export async function getOrganization(organizationId: string): Promise<{
  org: OrgRow;
  settings: OrgSettings;
  features: OrgFeatures;
} | null> {
  const db = await getDbAsync();
  const org = await db
    .prepare<OrgRow>(
      `SELECT id, name, slug, settings_json, features_json
       FROM organizations WHERE id = ?`,
    )
    .get(organizationId);
  if (!org) return null;
  return {
    org,
    settings: parseOrgSettings(parseJsonObject(org.settings_json)),
    features: parseFeatures(parseJsonObject(org.features_json)),
  };
}

export async function assertFeatureEnabled(
  organizationId: string,
  feature: keyof typeof DEFAULT_FEATURES,
): Promise<boolean> {
  const data = await getOrganization(organizationId);
  if (!data) return false;
  return data.features[feature] !== false;
}

export { DEFAULT_FEATURES, DEFAULT_ORG_SETTINGS };
