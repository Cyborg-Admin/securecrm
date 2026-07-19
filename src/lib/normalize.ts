/** Normalize company names for duplicate detection. */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|ag|sa|bv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeDomain(input?: string | null): string | null {
  if (!input) return null;
  try {
    const raw = input.includes("://") ? input : `https://${input}`;
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return input
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0]
      .trim() || null;
  }
}

/** LinkedIn profile URL → stable UID used across leads/contacts. */
export function normalizeLinkedInUid(url: string): string {
  const cleaned = url.trim().split("?")[0].split("#")[0].replace(/\/+$/, "");
  const match = cleaned.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (match?.[1]) {
    return `linkedin.com/in/${decodeURIComponent(match[1]).toLowerCase()}`;
  }
  const salesMatch = cleaned.match(/linkedin\.com\/sales\/lead\/([^,/?#]+)/i);
  if (salesMatch?.[1]) {
    return `linkedin.com/sales/lead/${salesMatch[1]}`;
  }
  return cleaned.toLowerCase().replace(/^https?:\/\//, "");
}

export function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}
