-- Step 10: connect project/site photo evidence to its ConstructionSite.
-- Additive, nullable column; existing FileAttachment rows remain valid.
ALTER TABLE "FileAttachment" ADD COLUMN "siteId" TEXT;

ALTER TABLE "FileAttachment"
ADD CONSTRAINT "FileAttachment_organizationId_projectId_siteId_fkey"
FOREIGN KEY ("organizationId", "projectId", "siteId")
REFERENCES "ConstructionSite" ("organizationId", "projectId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_media_org_project_site_status_time"
ON "FileAttachment" ("organizationId", "projectId", "siteId", "status", "createdAt" DESC);
