-- BuildTrack Step 6B: ADDITIVE migration only.
-- Dependencies: baseline Member, Project and ConstructionSite composite unique keys.
-- Run against an isolated migrated test DB FIRST; never reset your development database.
CREATE TABLE "operational_role_assignment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "grantedByMembershipId" TEXT NOT NULL,
  "role" VARCHAR(32) NOT NULL,
  "scope" VARCHAR(16) NOT NULL,
  "projectId" TEXT,
  "siteId" TEXT,
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedByMembershipId" TEXT,
  CONSTRAINT "operational_role_assignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ora_valid_scope_and_role_chk" CHECK (
    ("scope" = 'ORGANIZATION' AND "role" IN ('ADMIN', 'FINANCE_MANAGER')
      AND "projectId" IS NULL AND "siteId" IS NULL)
    OR ("scope" = 'PROJECT' AND "role" IN ('PROJECT_MANAGER', 'FINANCE_MANAGER', 'CONTRACTOR')
      AND "projectId" IS NOT NULL AND "siteId" IS NULL)
    OR ("scope" = 'SITE' AND "role" = 'SITE_ENGINEER'
      AND "projectId" IS NOT NULL AND "siteId" IS NOT NULL)
  ),
  CONSTRAINT "ora_valid_revocation_chk" CHECK (
    ("revokedAt" IS NULL AND "revokedByMembershipId" IS NULL) OR
    ("revokedAt" IS NOT NULL AND "revokedByMembershipId" IS NOT NULL)
  ),
  CONSTRAINT "ora_valid_expiry_chk" CHECK ("expiresAt" IS NULL OR "expiresAt" > "grantedAt"),
  CONSTRAINT "ora_valid_revocation_time_chk" CHECK ("revokedAt" IS NULL OR "revokedAt" >= "grantedAt")
);

CREATE INDEX "ora_member_state_idx" ON "operational_role_assignment" ("organizationId", "membershipId", "revokedAt");
CREATE INDEX "ora_project_state_idx" ON "operational_role_assignment" ("organizationId", "projectId", "revokedAt");
CREATE INDEX "ora_site_state_idx" ON "operational_role_assignment" ("organizationId", "siteId", "revokedAt");
CREATE INDEX "ora_grantor_idx" ON "operational_role_assignment" ("organizationId", "grantedByMembershipId", "grantedAt");

-- PostgreSQL NULLs do not compare equal in ordinary multi-column unique constraints.
-- Partial indexes enforce one active grant per scoped role while allowing history.
CREATE UNIQUE INDEX "ora_unique_active_org" ON "operational_role_assignment" ("organizationId", "membershipId", "role")
  WHERE "scope" = 'ORGANIZATION' AND "revokedAt" IS NULL;
CREATE UNIQUE INDEX "ora_unique_active_project" ON "operational_role_assignment" ("organizationId", "membershipId", "projectId", "role")
  WHERE "scope" = 'PROJECT' AND "revokedAt" IS NULL;
CREATE UNIQUE INDEX "ora_unique_active_site" ON "operational_role_assignment" ("organizationId", "membershipId", "projectId", "siteId", "role")
  WHERE "scope" = 'SITE' AND "revokedAt" IS NULL;

ALTER TABLE "operational_role_assignment" ADD CONSTRAINT "ora_subject_fk"
  FOREIGN KEY ("organizationId", "membershipId") REFERENCES "member" ("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_role_assignment" ADD CONSTRAINT "ora_grantor_fk"
  FOREIGN KEY ("organizationId", "grantedByMembershipId") REFERENCES "member" ("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_role_assignment" ADD CONSTRAINT "ora_revoker_fk"
  FOREIGN KEY ("organizationId", "revokedByMembershipId") REFERENCES "member" ("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_role_assignment" ADD CONSTRAINT "ora_project_fk"
  FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project" ("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "operational_role_assignment" ADD CONSTRAINT "ora_site_fk"
  FOREIGN KEY ("organizationId", "projectId", "siteId") REFERENCES "ConstructionSite" ("organizationId", "projectId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
