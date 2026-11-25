-- BuildTrack Step 2: EXTRA PostgreSQL guardrails.
-- REVIEW TEMPLATE: append to the first Prisma-generated migration.sql
-- AFTER the CREATE TABLE / CREATE TYPE statements. Do not execute standalone
-- before the Prisma base schema has been created.
-- Prisma model/table names are quoted exactly as generated from schema.prisma.

ALTER TABLE "Project" ADD CONSTRAINT project_dates_valid
  CHECK ("startDate" <= "expectedEndDate" AND ("actualEndDate" IS NULL OR "actualEndDate" >= "startDate"));

ALTER TABLE "Task" ADD CONSTRAINT task_dates_valid
  CHECK ("startsOn" IS NULL OR "startsOn" <= "dueOn");
ALTER TABLE "Task" ADD CONSTRAINT task_progress_valid
  CHECK ("progressPercent" BETWEEN 0 AND 100 AND ("status" <> 'COMPLETED' OR "progressPercent" = 100));
ALTER TABLE "TaskDependency" ADD CONSTRAINT task_dependency_not_self
  CHECK ("predecessorTaskId" <> "successorTaskId");

ALTER TABLE "ProjectBudget" ADD CONSTRAINT project_budget_nonnegative
  CHECK ("initialAmount" >= 0 AND "approvedAmount" >= 0);
ALTER TABLE "BudgetRevision" ADD CONSTRAINT budget_revision_valid
  CHECK ("revisionNumber" > 0 AND "previousAmount" >= 0 AND "newAmount" >= 0);
ALTER TABLE "Expense" ADD CONSTRAINT expense_amount_positive
  CHECK ("amount" > 0);
ALTER TABLE "Expense" ADD CONSTRAINT expense_lifecycle_fields_valid
  CHECK (
    ("status" = 'DRAFT' AND "postedAt" IS NULL AND "voidedAt" IS NULL AND "voidedByMembershipId" IS NULL)
    OR ("status" = 'POSTED' AND "postedAt" IS NOT NULL AND "voidedAt" IS NULL AND "voidedByMembershipId" IS NULL)
    OR ("status" = 'VOIDED' AND "postedAt" IS NOT NULL AND "voidedAt" IS NOT NULL AND "voidedByMembershipId" IS NOT NULL AND NULLIF(TRIM("voidReason"), '') IS NOT NULL)
  );

ALTER TABLE "SiteInventory" ADD CONSTRAINT inventory_balance_nonnegative
  CHECK ("onHand" >= 0 AND "reorderLevel" >= 0);
ALTER TABLE "MaterialRequestItem" ADD CONSTRAINT material_request_quantities_valid
  CHECK ("quantityRequested" > 0 AND
         ("quantityApproved" IS NULL OR ("quantityApproved" >= 0 AND "quantityApproved" <= "quantityRequested")));
ALTER TABLE "MaterialIssueItem" ADD CONSTRAINT material_issue_quantities_valid
  CHECK ("quantity" > 0 AND "consumedQuantity" >= 0 AND "consumedQuantity" <= "quantity");
ALTER TABLE "MaterialUsageRecord" ADD CONSTRAINT material_usage_positive
  CHECK ("quantity" > 0);
ALTER TABLE "StockMovement" ADD CONSTRAINT stock_movement_direction_valid
  CHECK (
    (("type" IN ('RECEIPT', 'RETURN', 'ADJUSTMENT_IN')) AND "quantityDelta" > 0)
    OR (("type" IN ('ISSUE', 'ADJUSTMENT_OUT')) AND "quantityDelta" < 0)
  );
ALTER TABLE "StockMovement" ADD CONSTRAINT stock_movement_source_valid
  CHECK (
    ("type" = 'ISSUE' AND "issueItemId" IS NOT NULL AND "returnOfIssueItemId" IS NULL)
    OR ("type" = 'RETURN' AND "issueItemId" IS NULL AND "returnOfIssueItemId" IS NOT NULL)
    OR ("type" IN ('RECEIPT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT') AND "issueItemId" IS NULL AND "returnOfIssueItemId" IS NULL)
  );
ALTER TABLE "StockMovement" ADD CONSTRAINT stock_adjustment_reason_required
  CHECK ("type" NOT IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT') OR NULLIF(TRIM("reason"), '') IS NOT NULL);

ALTER TABLE "DailyProgressReport" ADD CONSTRAINT observed_progress_valid
  CHECK ("observedProgress" IS NULL OR "observedProgress" BETWEEN 0 AND 100);
ALTER TABLE "FileAttachment" ADD CONSTRAINT attachment_size_positive
  CHECK ("byteSize" > 0);
ALTER TABLE "FileAttachment" ADD CONSTRAINT attachment_exactly_one_parent
  CHECK (
    ("projectId" IS NOT NULL)::integer +
    ("taskId" IS NOT NULL)::integer +
    ("expenseId" IS NOT NULL)::integer +
    ("reportId" IS NOT NULL)::integer = 1
  );

-- Append-only evidence: corrections are additive or modeled through status transitions.
-- Use the dedicated migration DB role for carefully planned future schema changes.
CREATE OR REPLACE FUNCTION buildtrack_reject_evidence_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Append-only evidence table % cannot be %', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_mutate_stock_movements
  BEFORE UPDATE OR DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION buildtrack_reject_evidence_mutation();
CREATE TRIGGER no_mutate_task_status_history
  BEFORE UPDATE OR DELETE ON "TaskStatusHistory"
  FOR EACH ROW EXECUTE FUNCTION buildtrack_reject_evidence_mutation();
CREATE TRIGGER no_mutate_budget_revisions
  BEFORE UPDATE OR DELETE ON "BudgetRevision"
  FOR EACH ROW EXECUTE FUNCTION buildtrack_reject_evidence_mutation();
CREATE TRIGGER no_mutate_material_usage
  BEFORE UPDATE OR DELETE ON "MaterialUsageRecord"
  FOR EACH ROW EXECUTE FUNCTION buildtrack_reject_evidence_mutation();
CREATE TRIGGER no_mutate_audit_events
  BEFORE UPDATE OR DELETE ON "AuditEvent"
  FOR EACH ROW EXECUTE FUNCTION buildtrack_reject_evidence_mutation();

-- NOTE: CHECK constraints cannot prevent dependency cycles or validate
-- cross-row issuance/returns. These require serialized service transactions,
-- selective row locks, and dedicated integration/concurrency tests.
-- PostgreSQL superusers / table owners can still disable triggers;
-- use a separate least-privileged runtime role in production.

-- Prevent reclassification/mutation of a posted expense. Allow a single
-- audited POSTED -> VOIDED transition. Draft changes are deliberately allowed.
CREATE OR REPLACE FUNCTION buildtrack_guard_expense_posting()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" = 'VOIDED' THEN
    RAISE EXCEPTION 'Voided expenses are immutable';
  END IF;
  IF OLD."status" = 'POSTED' THEN
    IF NEW."status" <> 'VOIDED'
       OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId"
       OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
       OR NEW."categoryId" IS DISTINCT FROM OLD."categoryId"
       OR NEW."title" IS DISTINCT FROM OLD."title"
       OR NEW."description" IS DISTINCT FROM OLD."description"
       OR NEW."amount" IS DISTINCT FROM OLD."amount"
       OR NEW."expenseDate" IS DISTINCT FROM OLD."expenseDate"
       OR NEW."recordedByMembershipId" IS DISTINCT FROM OLD."recordedByMembershipId"
       OR NEW."postedAt" IS DISTINCT FROM OLD."postedAt" THEN
      RAISE EXCEPTION 'Posted expenses may only be voided, not modified';
    END IF;
  END IF;
  IF OLD."status" = 'DRAFT' AND NEW."status" = 'VOIDED' THEN
    RAISE EXCEPTION 'Cannot void an expense that was never posted';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_expense_posting
  BEFORE UPDATE ON "Expense"
  FOR EACH ROW EXECUTE FUNCTION buildtrack_guard_expense_posting();

-- Protect the chain connecting an issuance to the correct site and material.
-- Quantities and balances still require a serialized service transaction.
CREATE OR REPLACE FUNCTION buildtrack_validate_stock_source()
RETURNS TRIGGER AS $$
DECLARE
  source_site TEXT;
  source_material TEXT;
  source_quantity NUMERIC;
  inventory_site TEXT;
  inventory_material TEXT;
BEGIN
  IF NEW."type" IN ('ISSUE', 'RETURN') THEN
    SELECT mi."siteId", mri."materialId", mii."quantity"
      INTO source_site, source_material, source_quantity
      FROM "MaterialIssueItem" mii
      JOIN "MaterialIssue" mi ON mi."id" = mii."issueId"
                              AND mi."organizationId" = mii."organizationId"
      JOIN "MaterialRequestItem" mri ON mri."id" = mii."requestItemId"
                                    AND mri."organizationId" = mii."organizationId"
     WHERE mii."organizationId" = NEW."organizationId"
       AND mii."id" = COALESCE(NEW."issueItemId", NEW."returnOfIssueItemId");
    SELECT si."siteId", si."materialId"
      INTO inventory_site, inventory_material
      FROM "SiteInventory" si
     WHERE si."id" = NEW."inventoryId"
       AND si."organizationId" = NEW."organizationId";
    IF source_site IS NULL OR source_material IS NULL OR inventory_site IS NULL
       OR source_site <> inventory_site OR source_material <> inventory_material THEN
      RAISE EXCEPTION 'Stock movement source does not match site inventory';
    END IF;
    IF NEW."type" = 'ISSUE' AND NEW."quantityDelta" <> -source_quantity THEN
      RAISE EXCEPTION 'Stock issue movement must match issued item quantity';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER validate_stock_source
  BEFORE INSERT ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION buildtrack_validate_stock_source();

-- Enforce an acyclic same-project dependency graph at the database boundary.
-- Composite FKs already guarantee both task IDs belong to the same project.
-- Lock the parent Project row to serialize parallel edge insertions.
CREATE OR REPLACE FUNCTION buildtrack_check_dependency_cycle()
RETURNS TRIGGER AS $$
DECLARE
  creates_cycle BOOLEAN;
BEGIN
  PERFORM 1 FROM "Project"
   WHERE "organizationId" = NEW."organizationId" AND "id" = NEW."projectId"
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent project does not exist';
  END IF;
  WITH RECURSIVE reachable(task_id) AS (
    SELECT "successorTaskId" FROM "TaskDependency"
     WHERE "organizationId" = NEW."organizationId"
       AND "projectId" = NEW."projectId"
       AND "predecessorTaskId" = NEW."successorTaskId"
    UNION
    SELECT d."successorTaskId" FROM "TaskDependency" d
    JOIN reachable r ON d."predecessorTaskId" = r.task_id
     WHERE d."organizationId" = NEW."organizationId"
       AND d."projectId" = NEW."projectId"
  )
  SELECT EXISTS (SELECT 1 FROM reachable WHERE task_id = NEW."predecessorTaskId")
    INTO creates_cycle;
  IF creates_cycle THEN
    RAISE EXCEPTION 'Task dependency cycle detected';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER task_dependency_acyclic
  BEFORE INSERT ON "TaskDependency"
  FOR EACH ROW EXECUTE FUNCTION buildtrack_check_dependency_cycle();

-- In v1, an edge is replaced with DELETE + INSERT, never updated in place.
CREATE OR REPLACE FUNCTION buildtrack_reject_dependency_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Task dependency edges cannot be updated: remove and re-add';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER task_dependency_no_update
  BEFORE UPDATE ON "TaskDependency"
  FOR EACH ROW EXECUTE FUNCTION buildtrack_reject_dependency_update();

-- Step 3 approved idempotency model checks.
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT idempotency_state_valid
  CHECK ("status" IN ('PROCESSING', 'COMPLETED'));
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT idempotency_result_valid
  CHECK (("status" = 'PROCESSING' AND "completedAt" IS NULL AND "responseStatus" IS NULL AND "responseBody" IS NULL)
     OR ("status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "responseStatus" IS NOT NULL));
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT idempotency_hash_hex_valid
  CHECK ("requestHash" ~ '^[a-f0-9]{64}$');
