-- OPTIONAL, separately reviewed performance optimization for ILIKE '%term%'.
-- Requires PostgreSQL extension privilege and must run OUTSIDE a transaction due to CONCURRENTLY.
-- Execute separately via psql on a backed-up database only after query-plan review.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "bt_project_name_trgm_idx" ON "Project" USING GIN ("name" gin_trgm_ops) WHERE "archivedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "bt_project_code_trgm_idx" ON "Project" USING GIN ("code" gin_trgm_ops) WHERE "archivedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "bt_site_name_trgm_idx" ON "ConstructionSite" USING GIN ("name" gin_trgm_ops) WHERE "archivedAt" IS NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "bt_site_location_trgm_idx" ON "ConstructionSite" USING GIN ("location" gin_trgm_ops) WHERE "archivedAt" IS NULL;
