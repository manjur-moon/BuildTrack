-- BuildTrack Step 9: non-destructive composite indexes for tenant-scoped active listings.
-- These are matched by @@index entries added to the existing Project/ConstructionSite Prisma models.
-- Review EXPLAIN plans and schedule DDL in a maintenance window for large production tables.
CREATE INDEX IF NOT EXISTS "bt_project_listing_idx" ON "Project"("organizationId", "archivedAt", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "bt_project_status_listing_idx" ON "Project"("organizationId", "archivedAt", "status", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "bt_site_listing_idx" ON "ConstructionSite"("organizationId", "archivedAt", "createdAt" DESC, "id" DESC);
CREATE INDEX IF NOT EXISTS "bt_site_project_listing_idx" ON "ConstructionSite"("organizationId", "projectId", "archivedAt", "createdAt" DESC, "id" DESC);
