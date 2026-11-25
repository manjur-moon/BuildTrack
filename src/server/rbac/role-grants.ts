import type { OperationalGrant } from "./policy";

/** Rows come exclusively from a scoped Prisma query, never from user JSON. */
export type PersistedGrant = {
  organizationId: string;
  role: string;
  scope: string;
  projectId: string | null;
  siteId: string | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
};

export type AssignmentSnapshot = {
  /** Active ProjectMember rows for this organization member on non-archived projects. */
  activeProjectIds: ReadonlySet<string>;
  /** Active SiteAssignment rows with active ProjectMember and non-archived site. */
  activeSiteKeys: ReadonlySet<string>;
  /** ContractorUser(company ACTIVE) + active ProjectContractorAssignment. */
  activeContractorProjectIds: ReadonlySet<string>;
};

export function siteAssignmentKey(projectId: string, siteId: string): string {
  return `${projectId}\u0000${siteId}`;
}

/**
 * A stored grant alone never confers project/site/contractor access.
 * It must still have a live corresponding assignment. Fail closed on bad rows.
 */
export function deriveOperationalGrants(
  organizationId: string,
  rows: readonly PersistedGrant[],
  assignments: AssignmentSnapshot,
  now: Date = new Date(),
): OperationalGrant[] {
  const grants: OperationalGrant[] = [];
  for (const row of rows) {
    if (row.organizationId !== organizationId || row.revokedAt !== null) continue;
    if (row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()) continue;

    if (row.scope === "ORGANIZATION" && row.projectId === null && row.siteId === null) {
      if (row.role === "ADMIN" || row.role === "FINANCE_MANAGER") {
        grants.push({ role: row.role, scope: "organization", organizationId });
      }
      continue;
    }
    if (row.scope === "PROJECT" && row.projectId && row.siteId === null) {
      if (!assignments.activeProjectIds.has(row.projectId)) continue;
      if (row.role === "PROJECT_MANAGER" || row.role === "FINANCE_MANAGER") {
        grants.push({ role: row.role, scope: "project", organizationId, projectId: row.projectId });
      } else if (row.role === "CONTRACTOR" && assignments.activeContractorProjectIds.has(row.projectId)) {
        grants.push({ role: "CONTRACTOR", scope: "project", organizationId, projectId: row.projectId });
      }
      continue;
    }
    if (row.scope === "SITE" && row.role === "SITE_ENGINEER" && row.projectId && row.siteId) {
      if (assignments.activeProjectIds.has(row.projectId) &&
          assignments.activeSiteKeys.has(siteAssignmentKey(row.projectId, row.siteId))) {
        grants.push({ role: "SITE_ENGINEER", scope: "site", organizationId, projectId: row.projectId, siteId: row.siteId });
      }
    }
  }
  return grants;
}
