BEGIN;
ALTER TABLE "Expense" ADD COLUMN "replacementOfId" TEXT;
CREATE UNIQUE INDEX "expense_project_identity_key" ON "Expense"("organizationId", "projectId", "id");
CREATE UNIQUE INDEX "expense_single_replacement_key" ON "Expense"("organizationId", "projectId", "replacementOfId");
ALTER TABLE "Expense" ADD CONSTRAINT "expense_correction_parent_fkey"
  FOREIGN KEY ("organizationId", "projectId", "replacementOfId") REFERENCES "Expense"("organizationId", "projectId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Expense" ADD CONSTRAINT "expense_correction_not_self_chk" CHECK ("replacementOfId" IS NULL OR "replacementOfId" <> "id");
-- A correction link cannot be assigned or changed after insertion; its parent must
-- already be voided. Existing posted/voided immutability triggers remain intact.
CREATE FUNCTION buildtrack_guard_expense_correction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."replacementOfId" IS NOT NULL THEN RAISE EXCEPTION 'Replacement expenses cannot be deleted'; END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW."replacementOfId" IS DISTINCT FROM OLD."replacementOfId"
       OR (OLD."replacementOfId" IS NOT NULL AND (NEW."projectId" IS DISTINCT FROM OLD."projectId"
          OR NEW."organizationId" IS DISTINCT FROM OLD."organizationId" OR NEW."id" IS DISTINCT FROM OLD."id")) THEN
      RAISE EXCEPTION 'Expense correction identity is immutable';
    END IF;
  ELSIF NEW."replacementOfId" IS NOT NULL THEN
    IF NEW."status" <> 'DRAFT' OR NOT EXISTS (SELECT 1 FROM "Expense" e WHERE e."id" = NEW."replacementOfId"
        AND e."organizationId" = NEW."organizationId" AND e."projectId" = NEW."projectId" AND e."status" = 'VOIDED') THEN
      RAISE EXCEPTION 'Replacement must be a draft linked to a voided expense';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_expense_correction BEFORE INSERT OR UPDATE OR DELETE ON "Expense" FOR EACH ROW EXECUTE FUNCTION buildtrack_guard_expense_correction();
COMMIT;
