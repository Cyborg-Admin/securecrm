import { getDb } from "@/lib/db";
import { normalizeLinkedInUid } from "@/lib/normalize";

export type MatchCandidate = {
  entity_type: "contact" | "lead";
  id: string;
  full_name: string;
  job_title: string | null;
  company_name: string | null;
  email: string | null;
  linkedin_uid: string | null;
  owner_user_id: string | null;
  score: number;
  reasons: string[];
};

function scoreName(a: string, b: string): number {
  const left = a.toLowerCase().trim();
  const right = b.toLowerCase().trim();
  if (!left || !right) return 0;
  if (left === right) return 60;
  if (left.includes(right) || right.includes(left)) return 40;
  const la = left.split(/\s+/);
  const ra = right.split(/\s+/);
  const overlap = la.filter((p) => ra.includes(p)).length;
  return Math.min(35, overlap * 15);
}

/** Find best CRM match for an open Gmail message / person stub. */
export function matchPerson(input: {
  organizationId: string;
  fullName?: string | null;
  email?: string | null;
  linkedinUrl?: string | null;
  companyName?: string | null;
}): MatchCandidate[] {
  const db = getDb();
  const candidates: MatchCandidate[] = [];
  const linkedinUid = input.linkedinUrl
    ? normalizeLinkedInUid(input.linkedinUrl)
    : null;

  if (linkedinUid) {
    const contact = db
      .prepare<{
        id: string;
        full_name: string;
        job_title: string | null;
        email: string | null;
        linkedin_uid: string | null;
        owner_user_id: string | null;
        company_id: string | null;
      }>(
        `SELECT id, full_name, job_title, email, linkedin_uid, owner_user_id, company_id
         FROM contacts WHERE organization_id = ? AND linkedin_uid = ?`,
      )
      .get(input.organizationId, linkedinUid);
    if (contact) {
      candidates.push({
        entity_type: "contact",
        id: contact.id,
        full_name: contact.full_name,
        job_title: contact.job_title,
        company_name: null,
        email: contact.email,
        linkedin_uid: contact.linkedin_uid,
        owner_user_id: contact.owner_user_id,
        score: 100,
        reasons: ["linkedin_uid_exact"],
      });
    }

    const lead = db
      .prepare<{
        id: string;
        full_name: string;
        job_title: string | null;
        company_name: string | null;
        linkedin_uid: string;
        owner_user_id: string | null;
      }>(
        `SELECT id, full_name, job_title, company_name, linkedin_uid, owner_user_id
         FROM leads WHERE organization_id = ? AND linkedin_uid = ?`,
      )
      .get(input.organizationId, linkedinUid);
    if (lead) {
      candidates.push({
        entity_type: "lead",
        id: lead.id,
        full_name: lead.full_name,
        job_title: lead.job_title,
        company_name: lead.company_name,
        email: null,
        linkedin_uid: lead.linkedin_uid,
        owner_user_id: lead.owner_user_id,
        score: 95,
        reasons: ["linkedin_uid_exact"],
      });
    }
  }

  if (input.email) {
    const email = input.email.trim().toLowerCase();
    const contact = db
      .prepare<{
        id: string;
        full_name: string;
        job_title: string | null;
        email: string | null;
        linkedin_uid: string | null;
        owner_user_id: string | null;
      }>(
        `SELECT id, full_name, job_title, email, linkedin_uid, owner_user_id
         FROM contacts WHERE organization_id = ? AND lower(email) = ?`,
      )
      .get(input.organizationId, email);
    if (contact) {
      candidates.push({
        entity_type: "contact",
        id: contact.id,
        full_name: contact.full_name,
        job_title: contact.job_title,
        company_name: null,
        email: contact.email,
        linkedin_uid: contact.linkedin_uid,
        owner_user_id: contact.owner_user_id,
        score: 90,
        reasons: ["email_exact"],
      });
    }
  }

  if (input.fullName?.trim()) {
    const name = input.fullName.trim();
    const leads = db
      .prepare<{
        id: string;
        full_name: string;
        job_title: string | null;
        company_name: string | null;
        linkedin_uid: string;
        owner_user_id: string | null;
      }>(
        `SELECT id, full_name, job_title, company_name, linkedin_uid, owner_user_id
         FROM leads
         WHERE organization_id = ?
           AND (full_name LIKE ? OR full_name LIKE ?)
         LIMIT 20`,
      )
      .all(input.organizationId, `%${name}%`, `%${name.split(/\s+/)[0]}%`);

    for (const lead of leads) {
      let score = scoreName(name, lead.full_name);
      const reasons = ["name_similarity"];
      if (
        input.companyName &&
        lead.company_name &&
        lead.company_name.toLowerCase().includes(input.companyName.toLowerCase())
      ) {
        score += 25;
        reasons.push("company_overlap");
      }
      if (score >= 35) {
        candidates.push({
          entity_type: "lead",
          id: lead.id,
          full_name: lead.full_name,
          job_title: lead.job_title,
          company_name: lead.company_name,
          email: null,
          linkedin_uid: lead.linkedin_uid,
          owner_user_id: lead.owner_user_id,
          score: Math.min(89, score),
          reasons,
        });
      }
    }

    const contacts = db
      .prepare<{
        id: string;
        full_name: string;
        job_title: string | null;
        email: string | null;
        linkedin_uid: string | null;
        owner_user_id: string | null;
      }>(
        `SELECT id, full_name, job_title, email, linkedin_uid, owner_user_id
         FROM contacts
         WHERE organization_id = ? AND full_name LIKE ?
         LIMIT 20`,
      )
      .all(input.organizationId, `%${name}%`);

    for (const contact of contacts) {
      const score = scoreName(name, contact.full_name);
      if (score >= 35) {
        candidates.push({
          entity_type: "contact",
          id: contact.id,
          full_name: contact.full_name,
          job_title: contact.job_title,
          company_name: null,
          email: contact.email,
          linkedin_uid: contact.linkedin_uid,
          owner_user_id: contact.owner_user_id,
          score: Math.min(89, score + (contact.email ? 5 : 0)),
          reasons: ["name_similarity"],
        });
      }
    }
  }

  const dedup = new Map<string, MatchCandidate>();
  for (const c of candidates) {
    const key = `${c.entity_type}:${c.id}`;
    const prev = dedup.get(key);
    if (!prev || prev.score < c.score) dedup.set(key, c);
  }

  return [...dedup.values()].sort((a, b) => b.score - a.score).slice(0, 8);
}
