/** BuildTrack Step 6A: pure, default-deny business authorization policy.
 * Never construct AuthorizationContext or Resource from untrusted request JSON.
 * Both must be resolved by the server from the authenticated session and database.
 */
export const BUSINESS_ROLES = [
  "ADMIN",
  "PROJECT_MANAGER",
  "SITE_ENGINEER",
  "FINANCE_MANAGER",
  "CONTRACTOR",
] as const;
export type BusinessRole = (typeof BUSINESS_ROLES)[number];

export const PERMISSIONS = [
  "organization:view", "member:invite", "role:assign", "audit:view",
  "project:create", "project:view", "project:summary:view", "project:update", "project:archive",
  "site:view", "site:update",
  "task:view", "task:create", "task:assign", "task:update", "task:status:update", "task:attachment:upload",
  "inventory:view", "stock:record", "material-request:create", "material-request:approve", "material:manage",
  "expense:view", "expense:create", "expense:post",
  "report:view", "contract:view", "contract:update",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Business roles are separate from Better Auth owner/member roles. */
export type OperationalGrant =
  | { role: "ADMIN" | "FINANCE_MANAGER"; scope: "organization"; organizationId: string }
  | { role: "FINANCE_MANAGER" | "PROJECT_MANAGER" | "CONTRACTOR"; scope: "project"; organizationId: string; projectId: string }
  | { role: "SITE_ENGINEER"; scope: "site"; organizationId: string; projectId: string; siteId: string };

export type AuthorizationContext = {
  organizationId: string;
  membershipId: string;
  membershipActive: boolean;
  emailVerified: boolean;
  /** Server-fetched Better Auth organization member role; do not trust client input. */
  betterAuthRole: string;
  /** Grants must be server-fetched and checked against active project/site/contractor assignments. */
  grants: readonly OperationalGrant[];
};

export type Resource = {
  organizationId: string;
  projectId?: string;
  siteId?: string;
  /** From TaskAssignment, for contractor task access. */
  assignedMembershipIds?: readonly string[];
  /** From Expense.recordedByMembershipId, for maker/checker controls. */
  recordedByMembershipId?: string;
  /** From Expense.status. */
  expenseStatus?: "DRAFT" | "POSTED" | "VOIDED";
};

const ROLE_PERMISSIONS: Record<BusinessRole, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  PROJECT_MANAGER: [
    "project:view", "project:update", "site:view", "site:update",
    "task:view", "task:create", "task:assign", "task:update", "task:status:update",
    "inventory:view", "stock:record", "material-request:create", "material-request:approve", "expense:view", "expense:create",
    "report:view", "contract:view",
  ],
  SITE_ENGINEER: [
    "site:view", "site:update", "task:view", "task:create", "task:status:update",
    "task:attachment:upload", "inventory:view", "stock:record", "material-request:create", "report:view",
  ],
  FINANCE_MANAGER: [
    "organization:view", "project:view", "inventory:view", "expense:view",
    "expense:create", "expense:post", "report:view", "contract:view",
  ],
  CONTRACTOR: [
    "project:summary:view", "task:view", "task:status:update", "task:attachment:upload",
  ],
};

const ORGANIZATION_ONLY = new Set<Permission>([
  "organization:view", "member:invite", "role:assign", "audit:view", "project:create", "material:manage",
]);

/** No implicit permission for Better Auth 'member' or 'admin' strings. */
export function hasPermission(
  context: AuthorizationContext,
  permission: Permission,
  resource: Resource,
): boolean {
  if (!context.membershipActive || !context.emailVerified) return false;
  if (!context.membershipId || !context.organizationId || !resource.organizationId) return false;
  if (context.organizationId !== resource.organizationId) return false;
  const orgAction = ORGANIZATION_ONLY.has(permission);
  if (!orgAction && !resource.projectId) return false;

  // Only an active organization owner gets implicit BuildTrack ADMIN permissions.
  // The exact comparison deliberately avoids substring/padded-role matching.
  const grants: readonly OperationalGrant[] = context.betterAuthRole === "owner"
    ? [{ role: "ADMIN", scope: "organization", organizationId: context.organizationId }, ...context.grants]
    : context.grants;

  return grants.some((grant) => {
    if (grant.organizationId !== context.organizationId) return false;
    if (!ROLE_PERMISSIONS[grant.role].includes(permission)) return false;
    if (orgAction && grant.scope !== "organization") return false;
    if (grant.scope === "project" && grant.projectId !== resource.projectId) return false;
    if (grant.scope === "site" && (
      grant.projectId !== resource.projectId || !resource.siteId || grant.siteId !== resource.siteId
    )) return false;

    // Contractor access requires an active contractor/company/project grant in the resolver,
    // plus per-task assignment; task list APIs must use the same predicate in SQL.
    if (grant.role === "CONTRACTOR" && permission.startsWith("task:") &&
        !resource.assignedMembershipIds?.includes(context.membershipId)) return false;

    // Existing Expense schema has DRAFT/POSTED/VOIDED, not an APPROVED state.
    // Posting is the financial approval boundary until an explicit workflow exists.
    if (permission === "expense:post") {
      if (resource.expenseStatus !== "DRAFT" || !resource.recordedByMembershipId) return false;
      if (resource.recordedByMembershipId === context.membershipId) return false;
    }
    return true;
  });
}
