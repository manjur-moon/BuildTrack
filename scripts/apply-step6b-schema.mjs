/** Safe, additive schema patch; fails closed if the expected models are absent. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve("prisma/schema.prisma");
const before = readFileSync(path, "utf8");
if (before.includes("model OperationalRoleAssignment {")) {
  console.log("Step 6B schema already present; no changes made.");
  process.exit(0);
}
let schema = before;
function insertOnce(anchor, addition) {
  const first = schema.indexOf(anchor);
  if (first < 0 || schema.indexOf(anchor, first + 1) >= 0) {
    throw new Error(`Cannot safely patch schema: missing or ambiguous anchor ${anchor.trim()}`);
  }
  schema = schema.slice(0, first + anchor.length) + addition + schema.slice(first + anchor.length);
}
// Partial unique indexes are supported by the project's pinned Prisma 7.10.1.
// Preserve project settings; the expected Step 5 generator has no other previews.
insertOnce('  output   = "../src/generated/prisma"\n', '  previewFeatures = ["partialIndexes"]\n');
// Explicit, named relations avoid collisions with Better Auth and existing business links.
insertOnce("model Member {\n", 
  "  businessRoleAssignments       OperationalRoleAssignment[] @relation(\"RoleAssignmentSubject\")\n" +
  "  businessRolesGranted         OperationalRoleAssignment[] @relation(\"RoleAssignmentGrantor\")\n" +
  "  businessRolesRevoked         OperationalRoleAssignment[] @relation(\"RoleAssignmentRevoker\")\n");
insertOnce("model Project {\n", 
  "  businessRoleAssignments       OperationalRoleAssignment[] @relation(\"RoleAssignmentProject\")\n");
insertOnce("model ConstructionSite {\n", 
  "  businessRoleAssignments       OperationalRoleAssignment[] @relation(\"RoleAssignmentSite\")\n");
const roleModel = `
// Step 6B: business role grants are NOT Better Auth's member.role.
// SQL migration enforces permitted role/scope combinations and active uniqueness.
model OperationalRoleAssignment {
  id                      String   @id @default(cuid())
  organizationId          String
  membershipId            String
  grantedByMembershipId   String
  role                    String   @db.VarChar(32)
  scope                   String   @db.VarChar(16)
  projectId               String?
  siteId                  String?
  grantedAt               DateTime @default(now())
  expiresAt               DateTime?
  revokedAt               DateTime?
  revokedByMembershipId   String?
  member                  Member   @relation("RoleAssignmentSubject", fields: [organizationId, membershipId], references: [organizationId, id], onDelete: Restrict)
  grantedBy               Member   @relation("RoleAssignmentGrantor", fields: [organizationId, grantedByMembershipId], references: [organizationId, id], onDelete: Restrict)
  revokedBy               Member?  @relation("RoleAssignmentRevoker", fields: [organizationId, revokedByMembershipId], references: [organizationId, id], onDelete: Restrict)
  project                 Project? @relation("RoleAssignmentProject", fields: [organizationId, projectId], references: [organizationId, id], onDelete: Restrict)
  site                    ConstructionSite? @relation("RoleAssignmentSite", fields: [organizationId, projectId, siteId], references: [organizationId, projectId, id], onDelete: Restrict)

  // Active-grant uniqueness; revoked rows are retained for audit.
  @@unique([organizationId, membershipId, role], map: "ora_unique_active_org", where: raw("\\"scope\\" = 'ORGANIZATION' AND \\"revokedAt\\" IS NULL"))
  @@unique([organizationId, membershipId, projectId, role], map: "ora_unique_active_project", where: raw("\\"scope\\" = 'PROJECT' AND \\"revokedAt\\" IS NULL"))
  @@unique([organizationId, membershipId, projectId, siteId, role], map: "ora_unique_active_site", where: raw("\\"scope\\" = 'SITE' AND \\"revokedAt\\" IS NULL"))
  @@index([organizationId, membershipId, revokedAt], map: "ora_member_state_idx")
  @@index([organizationId, projectId, revokedAt], map: "ora_project_state_idx")
  @@index([organizationId, siteId, revokedAt], map: "ora_site_state_idx")
  @@index([organizationId, grantedByMembershipId, grantedAt], map: "ora_grantor_idx")
  @@map("operational_role_assignment")
}
`;
schema += roleModel;
const backup = `${path}.before-step6b.bak`;
if (existsSync(backup)) throw new Error("Backup already exists; refuse to overwrite it.");
writeFileSync(backup, before);
writeFileSync(path, schema);
console.log("Added OperationalRoleAssignment to prisma/schema.prisma");
console.log("Backup: prisma/schema.prisma.before-step6b.bak");
console.log("Next: npm run db:validate (do NOT migrate until verified)");
