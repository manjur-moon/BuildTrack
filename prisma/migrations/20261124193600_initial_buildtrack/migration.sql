-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('PLANNED', 'ACTIVE', 'ON_HOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'REVIEW', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "MilestoneStatus" AS ENUM ('PLANNED', 'ACHIEVED', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContractorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'POSTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "MaterialUnit" AS ENUM ('PIECE', 'BAG', 'KILOGRAM', 'TONNE', 'LITRE', 'METRE', 'SQUARE_METRE', 'CUBIC_METRE', 'BOX');

-- CreateEnum
CREATE TYPE "MaterialRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RECEIPT', 'ISSUE', 'RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'READY', 'DELETED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_OVERDUE', 'PROJECT_DELAYED', 'BUDGET_OVERRUN', 'LOW_STOCK', 'MATERIAL_REQUEST', 'REPORT_SUBMITTED', 'SYSTEM');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "activeOrganizationId" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviterId" TEXT NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationSettings" (
    "organizationId" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Dhaka',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "expectedEndDate" DATE NOT NULL,
    "actualEndDate" DATE,
    "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNED',
    "managerMembershipId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstructionSite" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "status" "SiteStatus" NOT NULL DEFAULT 'PLANNED',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConstructionSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "SiteAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Milestone" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATE NOT NULL,
    "achievedAt" TIMESTAMP(3),
    "status" "MilestoneStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "siteId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "progressPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "startsOn" DATE,
    "dueOn" DATE NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdByMembershipId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),

    CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDependency" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "predecessorTaskId" TEXT NOT NULL,
    "successorTaskId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorMembershipId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskStatusHistory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromStatus" "TaskStatus" NOT NULL,
    "toStatus" "TaskStatus" NOT NULL,
    "actorMembershipId" TEXT NOT NULL,
    "note" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorCompany" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "status" "ContractorStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorUser" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ContractorUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectContractorAssignment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "assignedByMembershipId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectContractorAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBudget" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "initialAmount" DECIMAL(18,2) NOT NULL,
    "approvedAmount" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BDT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "previousAmount" DECIMAL(18,2) NOT NULL,
    "newAmount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "approvedByMembershipId" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "expenseDate" DATE NOT NULL,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "recordedByMembershipId" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidedByMembershipId" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "MaterialCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "MaterialUnit" NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteInventory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "onHand" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "reorderLevel" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "requestedByMembershipId" TEXT NOT NULL,
    "approvedByMembershipId" TEXT,
    "status" "MaterialRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "MaterialRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequestItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantityRequested" DECIMAL(18,3) NOT NULL,
    "quantityApproved" DECIMAL(18,3),

    CONSTRAINT "MaterialRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialIssue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "issuedByMembershipId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "MaterialIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialIssueItem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "requestItemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "consumedQuantity" DECIMAL(18,3) NOT NULL DEFAULT 0,

    CONSTRAINT "MaterialIssueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantityDelta" DECIMAL(18,3) NOT NULL,
    "issueItemId" TEXT,
    "returnOfIssueItemId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "reason" TEXT,
    "performedByMembershipId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialUsageRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "issueItemId" TEXT NOT NULL,
    "reportId" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "recordedByMembershipId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "MaterialUsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyProgressReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "taskId" TEXT,
    "reportedByMembershipId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "observedProgress" DECIMAL(5,2),
    "workDescription" TEXT NOT NULL,
    "delayReason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyProgressReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAttachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "expenseId" TEXT,
    "reportId" TEXT,
    "uploadedByMembershipId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FileAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientMembershipId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorMembershipId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ipAddress" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "operation" VARCHAR(100) NOT NULL,
    "requestKey" VARCHAR(128) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "member_userId_idx" ON "member"("userId");

-- CreateIndex
CREATE INDEX "member_organizationId_disabledAt_idx" ON "member"("organizationId", "disabledAt");

-- CreateIndex
CREATE UNIQUE INDEX "member_organizationId_userId_key" ON "member"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "member_organizationId_id_key" ON "member"("organizationId", "id");

-- CreateIndex
CREATE INDEX "invitation_organizationId_email_idx" ON "invitation"("organizationId", "email");

-- CreateIndex
CREATE INDEX "invitation_inviterId_idx" ON "invitation"("inviterId");

-- CreateIndex
CREATE INDEX "Project_organizationId_status_expectedEndDate_idx" ON "Project"("organizationId", "status", "expectedEndDate");

-- CreateIndex
CREATE INDEX "Project_organizationId_managerMembershipId_idx" ON "Project"("organizationId", "managerMembershipId");

-- CreateIndex
CREATE INDEX "Project_organizationId_archivedAt_idx" ON "Project"("organizationId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_id_key" ON "Project"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Project_organizationId_code_key" ON "Project"("organizationId", "code");

-- CreateIndex
CREATE INDEX "ProjectMember_organizationId_membershipId_leftAt_idx" ON "ProjectMember"("organizationId", "membershipId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_organizationId_projectId_membershipId_key" ON "ProjectMember"("organizationId", "projectId", "membershipId");

-- CreateIndex
CREATE INDEX "ConstructionSite_organizationId_projectId_status_idx" ON "ConstructionSite"("organizationId", "projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConstructionSite_organizationId_id_key" ON "ConstructionSite"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ConstructionSite_organizationId_projectId_id_key" ON "ConstructionSite"("organizationId", "projectId", "id");

-- CreateIndex
CREATE INDEX "SiteAssignment_organizationId_membershipId_endedAt_idx" ON "SiteAssignment"("organizationId", "membershipId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiteAssignment_organizationId_siteId_membershipId_key" ON "SiteAssignment"("organizationId", "siteId", "membershipId");

-- CreateIndex
CREATE INDEX "Milestone_organizationId_projectId_dueDate_idx" ON "Milestone"("organizationId", "projectId", "dueDate");

-- CreateIndex
CREATE INDEX "Task_organizationId_projectId_status_dueOn_idx" ON "Task"("organizationId", "projectId", "status", "dueOn");

-- CreateIndex
CREATE INDEX "Task_organizationId_siteId_dueOn_idx" ON "Task"("organizationId", "siteId", "dueOn");

-- CreateIndex
CREATE INDEX "Task_organizationId_priority_dueOn_idx" ON "Task"("organizationId", "priority", "dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "Task_organizationId_id_key" ON "Task"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Task_organizationId_projectId_id_key" ON "Task"("organizationId", "projectId", "id");

-- CreateIndex
CREATE INDEX "TaskAssignment_organizationId_membershipId_unassignedAt_idx" ON "TaskAssignment"("organizationId", "membershipId", "unassignedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignment_organizationId_taskId_membershipId_key" ON "TaskAssignment"("organizationId", "taskId", "membershipId");

-- CreateIndex
CREATE INDEX "TaskDependency_organizationId_projectId_successorTaskId_idx" ON "TaskDependency"("organizationId", "projectId", "successorTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDependency_organizationId_projectId_predecessorTaskId_s_key" ON "TaskDependency"("organizationId", "projectId", "predecessorTaskId", "successorTaskId");

-- CreateIndex
CREATE INDEX "TaskComment_organizationId_taskId_createdAt_idx" ON "TaskComment"("organizationId", "taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskStatusHistory_organizationId_taskId_changedAt_idx" ON "TaskStatusHistory"("organizationId", "taskId", "changedAt");

-- CreateIndex
CREATE INDEX "ContractorCompany_organizationId_status_name_idx" ON "ContractorCompany"("organizationId", "status", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorCompany_organizationId_id_key" ON "ContractorCompany"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ContractorUser_organizationId_contractorId_idx" ON "ContractorUser"("organizationId", "contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorUser_organizationId_membershipId_key" ON "ContractorUser"("organizationId", "membershipId");

-- CreateIndex
CREATE INDEX "ProjectContractorAssignment_organizationId_contractorId_end_idx" ON "ProjectContractorAssignment"("organizationId", "contractorId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContractorAssignment_organizationId_projectId_contra_key" ON "ProjectContractorAssignment"("organizationId", "projectId", "contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBudget_organizationId_id_key" ON "ProjectBudget"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBudget_organizationId_projectId_key" ON "ProjectBudget"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "BudgetRevision_organizationId_approvedAt_idx" ON "BudgetRevision"("organizationId", "approvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetRevision_organizationId_budgetId_revisionNumber_key" ON "BudgetRevision"("organizationId", "budgetId", "revisionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_organizationId_id_key" ON "ExpenseCategory"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_organizationId_name_key" ON "ExpenseCategory"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Expense_organizationId_projectId_status_expenseDate_idx" ON "Expense"("organizationId", "projectId", "status", "expenseDate");

-- CreateIndex
CREATE INDEX "Expense_organizationId_categoryId_expenseDate_idx" ON "Expense"("organizationId", "categoryId", "expenseDate");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_organizationId_id_key" ON "Expense"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCategory_organizationId_id_key" ON "MaterialCategory"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialCategory_organizationId_name_key" ON "MaterialCategory"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Material_organizationId_categoryId_name_idx" ON "Material"("organizationId", "categoryId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Material_organizationId_id_key" ON "Material"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Material_organizationId_sku_key" ON "Material"("organizationId", "sku");

-- CreateIndex
CREATE INDEX "SiteInventory_organizationId_materialId_idx" ON "SiteInventory"("organizationId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteInventory_organizationId_id_key" ON "SiteInventory"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "SiteInventory_organizationId_siteId_materialId_key" ON "SiteInventory"("organizationId", "siteId", "materialId");

-- CreateIndex
CREATE INDEX "MaterialRequest_organizationId_projectId_status_requestedAt_idx" ON "MaterialRequest"("organizationId", "projectId", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "MaterialRequest_organizationId_requestedByMembershipId_requ_idx" ON "MaterialRequest"("organizationId", "requestedByMembershipId", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequest_organizationId_id_key" ON "MaterialRequest"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequest_organizationId_projectId_siteId_id_key" ON "MaterialRequest"("organizationId", "projectId", "siteId", "id");

-- CreateIndex
CREATE INDEX "MaterialRequestItem_organizationId_materialId_idx" ON "MaterialRequestItem"("organizationId", "materialId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequestItem_organizationId_id_key" ON "MaterialRequestItem"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequestItem_organizationId_requestId_id_key" ON "MaterialRequestItem"("organizationId", "requestId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequestItem_organizationId_requestId_materialId_key" ON "MaterialRequestItem"("organizationId", "requestId", "materialId");

-- CreateIndex
CREATE INDEX "MaterialIssue_organizationId_requestId_issuedAt_idx" ON "MaterialIssue"("organizationId", "requestId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialIssue_organizationId_id_key" ON "MaterialIssue"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialIssue_organizationId_requestId_id_key" ON "MaterialIssue"("organizationId", "requestId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialIssue_organizationId_idempotencyKey_key" ON "MaterialIssue"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MaterialIssueItem_organizationId_requestItemId_idx" ON "MaterialIssueItem"("organizationId", "requestItemId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialIssueItem_organizationId_id_key" ON "MaterialIssueItem"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialIssueItem_organizationId_issueId_requestItemId_key" ON "MaterialIssueItem"("organizationId", "issueId", "requestItemId");

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_inventoryId_recordedAt_idx" ON "StockMovement"("organizationId", "inventoryId", "recordedAt");

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_returnOfIssueItemId_idx" ON "StockMovement"("organizationId", "returnOfIssueItemId");

-- CreateIndex
CREATE INDEX "StockMovement_organizationId_type_recordedAt_idx" ON "StockMovement"("organizationId", "type", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_organizationId_idempotencyKey_key" ON "StockMovement"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_organizationId_issueItemId_key" ON "StockMovement"("organizationId", "issueItemId");

-- CreateIndex
CREATE INDEX "MaterialUsageRecord_organizationId_issueItemId_usedAt_idx" ON "MaterialUsageRecord"("organizationId", "issueItemId", "usedAt");

-- CreateIndex
CREATE INDEX "MaterialUsageRecord_organizationId_reportId_idx" ON "MaterialUsageRecord"("organizationId", "reportId");

-- CreateIndex
CREATE INDEX "DailyProgressReport_organizationId_projectId_siteId_workDat_idx" ON "DailyProgressReport"("organizationId", "projectId", "siteId", "workDate");

-- CreateIndex
CREATE INDEX "DailyProgressReport_organizationId_reportedByMembershipId_w_idx" ON "DailyProgressReport"("organizationId", "reportedByMembershipId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyProgressReport_organizationId_id_key" ON "DailyProgressReport"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "FileAttachment_objectKey_key" ON "FileAttachment"("objectKey");

-- CreateIndex
CREATE INDEX "FileAttachment_organizationId_projectId_idx" ON "FileAttachment"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "FileAttachment_organizationId_taskId_idx" ON "FileAttachment"("organizationId", "taskId");

-- CreateIndex
CREATE INDEX "FileAttachment_organizationId_expenseId_idx" ON "FileAttachment"("organizationId", "expenseId");

-- CreateIndex
CREATE INDEX "FileAttachment_organizationId_reportId_idx" ON "FileAttachment"("organizationId", "reportId");

-- CreateIndex
CREATE INDEX "Notification_organizationId_recipientMembershipId_readAt_cr_idx" ON "Notification"("organizationId", "recipientMembershipId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_resourceType_resourceId_createdAt_idx" ON "AuditEvent"("organizationId", "resourceType", "resourceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_actorMembershipId_createdAt_idx" ON "AuditEvent"("organizationId", "actorMembershipId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_organizationId_createdAt_idx" ON "IdempotencyRecord"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_organizationId_operation_requestKey_key" ON "IdempotencyRecord"("organizationId", "operation", "requestKey");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_organizationId_managerMembershipId_fkey" FOREIGN KEY ("organizationId", "managerMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionSite" ADD CONSTRAINT "ConstructionSite_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAssignment" ADD CONSTRAINT "SiteAssignment_organizationId_projectId_siteId_fkey" FOREIGN KEY ("organizationId", "projectId", "siteId") REFERENCES "ConstructionSite"("organizationId", "projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAssignment" ADD CONSTRAINT "SiteAssignment_organizationId_projectId_membershipId_fkey" FOREIGN KEY ("organizationId", "projectId", "membershipId") REFERENCES "ProjectMember"("organizationId", "projectId", "membershipId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Milestone" ADD CONSTRAINT "Milestone_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_projectId_siteId_fkey" FOREIGN KEY ("organizationId", "projectId", "siteId") REFERENCES "ConstructionSite"("organizationId", "projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_createdByMembershipId_fkey" FOREIGN KEY ("organizationId", "createdByMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_organizationId_projectId_taskId_fkey" FOREIGN KEY ("organizationId", "projectId", "taskId") REFERENCES "Task"("organizationId", "projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_organizationId_projectId_membershipId_fkey" FOREIGN KEY ("organizationId", "projectId", "membershipId") REFERENCES "ProjectMember"("organizationId", "projectId", "membershipId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_organizationId_projectId_predecessorTaskId_fkey" FOREIGN KEY ("organizationId", "projectId", "predecessorTaskId") REFERENCES "Task"("organizationId", "projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_organizationId_projectId_successorTaskId_fkey" FOREIGN KEY ("organizationId", "projectId", "successorTaskId") REFERENCES "Task"("organizationId", "projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_organizationId_taskId_fkey" FOREIGN KEY ("organizationId", "taskId") REFERENCES "Task"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_organizationId_authorMembershipId_fkey" FOREIGN KEY ("organizationId", "authorMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStatusHistory" ADD CONSTRAINT "TaskStatusHistory_organizationId_taskId_fkey" FOREIGN KEY ("organizationId", "taskId") REFERENCES "Task"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskStatusHistory" ADD CONSTRAINT "TaskStatusHistory_organizationId_actorMembershipId_fkey" FOREIGN KEY ("organizationId", "actorMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorCompany" ADD CONSTRAINT "ContractorCompany_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorUser" ADD CONSTRAINT "ContractorUser_organizationId_contractorId_fkey" FOREIGN KEY ("organizationId", "contractorId") REFERENCES "ContractorCompany"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorUser" ADD CONSTRAINT "ContractorUser_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContractorAssignment" ADD CONSTRAINT "ProjectContractorAssignment_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContractorAssignment" ADD CONSTRAINT "ProjectContractorAssignment_organizationId_contractorId_fkey" FOREIGN KEY ("organizationId", "contractorId") REFERENCES "ContractorCompany"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectContractorAssignment" ADD CONSTRAINT "ProjectContractorAssignment_organizationId_assignedByMembe_fkey" FOREIGN KEY ("organizationId", "assignedByMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectBudget" ADD CONSTRAINT "ProjectBudget_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetRevision" ADD CONSTRAINT "BudgetRevision_organizationId_budgetId_fkey" FOREIGN KEY ("organizationId", "budgetId") REFERENCES "ProjectBudget"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetRevision" ADD CONSTRAINT "BudgetRevision_organizationId_approvedByMembershipId_fkey" FOREIGN KEY ("organizationId", "approvedByMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_categoryId_fkey" FOREIGN KEY ("organizationId", "categoryId") REFERENCES "ExpenseCategory"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_recordedByMembershipId_fkey" FOREIGN KEY ("organizationId", "recordedByMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_organizationId_voidedByMembershipId_fkey" FOREIGN KEY ("organizationId", "voidedByMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCategory" ADD CONSTRAINT "MaterialCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_organizationId_categoryId_fkey" FOREIGN KEY ("organizationId", "categoryId") REFERENCES "MaterialCategory"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInventory" ADD CONSTRAINT "SiteInventory_organizationId_siteId_fkey" FOREIGN KEY ("organizationId", "siteId") REFERENCES "ConstructionSite"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteInventory" ADD CONSTRAINT "SiteInventory_organizationId_materialId_fkey" FOREIGN KEY ("organizationId", "materialId") REFERENCES "Material"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_organizationId_projectId_siteId_fkey" FOREIGN KEY ("organizationId", "projectId", "siteId") REFERENCES "ConstructionSite"("organizationId", "projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_organizationId_requestedByMembershipId_fkey" FOREIGN KEY ("organizationId", "requestedByMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_organizationId_approvedByMembershipId_fkey" FOREIGN KEY ("organizationId", "approvedByMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequestItem" ADD CONSTRAINT "MaterialRequestItem_organizationId_requestId_fkey" FOREIGN KEY ("organizationId", "requestId") REFERENCES "MaterialRequest"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequestItem" ADD CONSTRAINT "MaterialRequestItem_organizationId_materialId_fkey" FOREIGN KEY ("organizationId", "materialId") REFERENCES "Material"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_organizationId_projectId_siteId_requestId_fkey" FOREIGN KEY ("organizationId", "projectId", "siteId", "requestId") REFERENCES "MaterialRequest"("organizationId", "projectId", "siteId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_organizationId_issuedByMembershipId_fkey" FOREIGN KEY ("organizationId", "issuedByMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssueItem" ADD CONSTRAINT "MaterialIssueItem_organizationId_requestId_issueId_fkey" FOREIGN KEY ("organizationId", "requestId", "issueId") REFERENCES "MaterialIssue"("organizationId", "requestId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssueItem" ADD CONSTRAINT "MaterialIssueItem_organizationId_requestId_requestItemId_fkey" FOREIGN KEY ("organizationId", "requestId", "requestItemId") REFERENCES "MaterialRequestItem"("organizationId", "requestId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_organizationId_inventoryId_fkey" FOREIGN KEY ("organizationId", "inventoryId") REFERENCES "SiteInventory"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_organizationId_issueItemId_fkey" FOREIGN KEY ("organizationId", "issueItemId") REFERENCES "MaterialIssueItem"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_organizationId_returnOfIssueItemId_fkey" FOREIGN KEY ("organizationId", "returnOfIssueItemId") REFERENCES "MaterialIssueItem"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_organizationId_performedByMembershipId_fkey" FOREIGN KEY ("organizationId", "performedByMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUsageRecord" ADD CONSTRAINT "MaterialUsageRecord_organizationId_issueItemId_fkey" FOREIGN KEY ("organizationId", "issueItemId") REFERENCES "MaterialIssueItem"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUsageRecord" ADD CONSTRAINT "MaterialUsageRecord_organizationId_reportId_fkey" FOREIGN KEY ("organizationId", "reportId") REFERENCES "DailyProgressReport"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUsageRecord" ADD CONSTRAINT "MaterialUsageRecord_organizationId_recordedByMembershipId_fkey" FOREIGN KEY ("organizationId", "recordedByMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgressReport" ADD CONSTRAINT "DailyProgressReport_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgressReport" ADD CONSTRAINT "DailyProgressReport_organizationId_projectId_siteId_fkey" FOREIGN KEY ("organizationId", "projectId", "siteId") REFERENCES "ConstructionSite"("organizationId", "projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgressReport" ADD CONSTRAINT "DailyProgressReport_organizationId_projectId_taskId_fkey" FOREIGN KEY ("organizationId", "projectId", "taskId") REFERENCES "Task"("organizationId", "projectId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyProgressReport" ADD CONSTRAINT "DailyProgressReport_organizationId_reportedByMembershipId_fkey" FOREIGN KEY ("organizationId", "reportedByMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAttachment" ADD CONSTRAINT "FileAttachment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAttachment" ADD CONSTRAINT "FileAttachment_organizationId_projectId_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAttachment" ADD CONSTRAINT "FileAttachment_organizationId_taskId_fkey" FOREIGN KEY ("organizationId", "taskId") REFERENCES "Task"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAttachment" ADD CONSTRAINT "FileAttachment_organizationId_expenseId_fkey" FOREIGN KEY ("organizationId", "expenseId") REFERENCES "Expense"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAttachment" ADD CONSTRAINT "FileAttachment_organizationId_reportId_fkey" FOREIGN KEY ("organizationId", "reportId") REFERENCES "DailyProgressReport"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAttachment" ADD CONSTRAINT "FileAttachment_organizationId_uploadedByMembershipId_fkey" FOREIGN KEY ("organizationId", "uploadedByMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_recipientMembershipId_fkey" FOREIGN KEY ("organizationId", "recipientMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_actorMembershipId_fkey" FOREIGN KEY ("organizationId", "actorMembershipId") REFERENCES "member"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- BuildTrack reviewed SQL guardrails
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

-- BuildTrack review fix: prohibit deletion of posted or voided expenses.
-- Draft expenses remain deletable by callers authorized by the API.
CREATE OR REPLACE FUNCTION buildtrack_protect_expense_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" IN ('POSTED', 'VOIDED') THEN
    RAISE EXCEPTION 'Posted and voided expenses cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_posted_expense_delete
  BEFORE DELETE ON "Expense"
  FOR EACH ROW EXECUTE FUNCTION buildtrack_protect_expense_delete();
