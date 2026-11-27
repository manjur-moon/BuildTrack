import { prisma } from "@/server/db/client";
import { ApiError } from "@/server/api/errors";
import { hasPermission, type AuthorizationContext, type Permission } from "@/server/rbac/policy";
import { assertCurrentWriteAccess } from "@/server/construction/write-access";
import { requireLiveProjectLock } from "@/server/construction/locking";
import { inventoryWrite, audit, type Tx } from "@/server/inventory/transaction";
import type { FinanceInput } from "./input";
import { cents, money, financialTotals } from "./money";

function missing(): never { throw new ApiError(404, "NOT_FOUND", "Financial resource not found."); }
function conflict(message: string): never { throw new ApiError(409, "CONFLICT", message); }
function canEditExpense(actor: AuthorizationContext, projectId: string, recorderId: string) {
  const r = resource(actor, projectId);
  return recorderId === actor.membershipId && hasPermission(actor,"expense:create",r);
}
const resource = (actor: AuthorizationContext, projectId?: string) => ({ organizationId: actor.organizationId, projectId });
async function authorize(tx: Tx, actor: AuthorizationContext, permission: Permission, projectId?: string) {
  if (projectId) await requireLiveProjectLock(tx, actor.organizationId, projectId);
  await assertCurrentWriteAccess(tx, actor, permission, resource(actor, projectId));
}
async function totals(tx: Tx, organizationId: string, projectId: string) {
  const budget = await tx.projectBudget.findFirst({ where: { organizationId, projectId } });
  const actual = await tx.expense.aggregate({ where: { organizationId, projectId, status: "POSTED" }, _sum: { amount: true } });
  return financialTotals(budget?.approvedAmount.toFixed(2) ?? null, actual._sum.amount?.toFixed(2) ?? "0");
}
export async function listFinance(actor: AuthorizationContext, projectId: string, page: number) {
  return prisma.$transaction(async (tx) => {
    await authorize(tx, actor, "expense:view", projectId);
    const where = { organizationId: actor.organizationId, projectId };
    const summary = await totals(tx, actor.organizationId, projectId);
    const expenses = await tx.expense.findMany({ where, orderBy: [{ expenseDate: "desc" }, { id: "desc" }], skip: (page-1)*20, take: 20,
      include: { category: { select: { name: true } }, replacement: { select: { id:true } }, attachments: { where: { deletedAt:null }, orderBy: {createdAt:"asc"}, select: {id:true,originalName:true,mimeType:true,byteSize:true,status:true} } } });
    const total = await tx.expense.count({ where });
    const categories = await tx.expenseCategory.findMany({ where: { organizationId: actor.organizationId, archivedAt: null }, orderBy: { name: "asc" }, take: 100 });
    const budget = await tx.projectBudget.findFirst({ where, include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 20 } } });
    const r = resource(actor, projectId);
    return { summary, total, page, categories: categories.map(x => ({id:x.id,name:x.name})),
      canManage: hasPermission(actor,"expense:manage",r), canDraft: hasPermission(actor,"expense:create",r),
      canCategory: hasPermission(actor,"expense-category:manage",resource(actor)),
      expenses: expenses.map(e => ({ id:e.id,title:e.title,category:e.category.name,amount:e.amount.toFixed(2),date:e.expenseDate.toISOString().slice(0,10),status:e.status,
        canPost: !e.attachments.some(a=>a.status==="PENDING") && hasPermission(actor,"expense:post",{...r,expenseStatus:e.status,recordedByMembershipId:e.recordedByMembershipId}),
        voidReason:e.voidReason, description:e.description, categoryId:e.categoryId, updatedAt:e.updatedAt.toISOString(),
        replacementOfId:e.replacementOfId, replacementId:e.replacement?.id ?? null,
        documents:e.attachments.map(a=>({id:a.id,name:a.originalName,mimeType:a.mimeType,byteSize:Number(a.byteSize),status:a.status})),
        canEdit:e.status === "DRAFT" && canEditExpense(actor,projectId,e.recordedByMembershipId) })),
      revisions: budget?.revisions.map(x => ({id:x.id,number:x.revisionNumber,previous:x.previousAmount.toFixed(2),amount:x.newAmount.toFixed(2),reason:x.reason,date:x.approvedAt.toISOString()})) ?? [] };
  });
}
export async function mutateFinance(actor: AuthorizationContext, input: FinanceInput, key: string, requestId: string) {
  const projectId = input.action === "category" ? undefined : input.projectId;
  const permission: Permission = input.action === "category" ? "expense-category:manage" : input.action === "draft" ? "expense:create" : "expense:manage";
  const guard = async (tx: Tx) => {
    if (input.action !== "edit") return authorize(tx,actor,permission,projectId);
    await requireLiveProjectLock(tx,actor.organizationId,input.projectId);
    const row = await tx.expense.findFirst({where:{organizationId:actor.organizationId,projectId:input.projectId,id:input.expenseId},select:{recordedByMembershipId:true}});
    if (!row || !canEditExpense(actor,input.projectId,row.recordedByMembershipId)) missing();
    await assertCurrentWriteAccess(tx,actor,"expense:create",resource(actor,input.projectId));
  };
  return inventoryWrite(actor, `finance.${input.action}`, key, input, guard, async (tx) => {
    await guard(tx);
    const organizationId = actor.organizationId;
    if (input.action === "category") {
      const row = await tx.expenseCategory.create({ data: { organizationId, name: input.name } });
      await audit(tx,actor,requestId,"EXPENSE_CATEGORY_CREATED","EXPENSE_CATEGORY",row.id,{name:row.name});
      return { id:row.id };
    }
    const where = { organizationId, projectId: input.projectId };
    if (input.action === "budget") {
      const old = await tx.projectBudget.findFirst({ where });
      if ((old?.approvedAmount.toFixed(2) ?? null) !== (input.expected === null ? null : money(cents(input.expected)))) conflict("Budget changed. Refresh before retrying.");
      if (old && old.approvedAmount.toFixed(2) === money(cents(input.amount))) conflict("Budget amount is unchanged.");
      if (!old) {
        const row = await tx.projectBudget.create({data:{...where,initialAmount:input.amount,approvedAmount:input.amount,currency:"BDT"}});
        await audit(tx,actor,requestId,"BUDGET_CREATED","PROJECT_BUDGET",row.id,{amount:input.amount,reason:input.reason});
        return {id:row.id};
      }
      const last = await tx.budgetRevision.aggregate({where:{organizationId,budgetId:old.id},_max:{revisionNumber:true}});
      await tx.budgetRevision.create({data:{organizationId,budgetId:old.id,revisionNumber:(last._max.revisionNumber ?? 0)+1,previousAmount:old.approvedAmount,newAmount:input.amount,reason:input.reason,approvedByMembershipId:actor.membershipId}});
      await tx.projectBudget.update({where:{id:old.id},data:{approvedAmount:input.amount}});
      await audit(tx,actor,requestId,"BUDGET_REVISED","PROJECT_BUDGET",old.id,{amount:input.amount,reason:input.reason},{amount:old.approvedAmount.toFixed(2)});
      return {id:old.id};
    }
    if (input.action === "draft") {
      const category = await tx.expenseCategory.findFirst({where:{id:input.categoryId,organizationId,archivedAt:null}});
      if (!category) missing();
      const row = await tx.expense.create({data:{...where,categoryId:category.id,title:input.title,description:input.description,amount:input.amount,expenseDate:new Date(`${input.date}T00:00:00Z`),recordedByMembershipId:actor.membershipId}});
      await audit(tx,actor,requestId,"EXPENSE_DRAFTED","EXPENSE",row.id,{amount:input.amount,title:input.title,status:"DRAFT"});
      return {id:row.id};
    }
    const row = await tx.expense.findFirst({where:{...where,id:input.expenseId}});
    if (!row) missing();
    if (row.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) conflict("Expense changed. Refresh before retrying.");
    if (input.action === "edit") {
      if (row.status !== "DRAFT") conflict("Only draft expenses can be edited.");
      const category = await tx.expenseCategory.findFirst({where:{id:input.categoryId,organizationId,archivedAt:null}});
      if (!category) missing();
      const changes = {categoryId:category.id,title:input.title,description:input.description ?? null,amount:input.amount,expenseDate:new Date(`${input.date}T00:00:00Z`)};
      // Explicit monotonic version even for two mutations within the same millisecond.
      await tx.expense.update({where:{id:row.id},data:{...changes,updatedAt:new Date(Math.max(Date.now(),row.updatedAt.getTime()+1))}});
      await audit(tx,actor,requestId,"EXPENSE_DRAFT_EDITED","EXPENSE",row.id,{categoryId:category.id,title:input.title,description:changes.description,amount:money(cents(input.amount)),date:input.date},
        {categoryId:row.categoryId,title:row.title,description:row.description,amount:row.amount.toFixed(2),date:row.expenseDate.toISOString().slice(0,10)});
      return {id:row.id};
    }
    if (input.action === "replace") {
      if (row.status !== "POSTED") conflict("Only posted expenses can be corrected.");
      const category = await tx.expenseCategory.findFirst({where:{id:input.categoryId,organizationId,archivedAt:null}});
      if (!category) missing();
      await tx.expense.update({where:{id:row.id},data:{status:"VOIDED",voidedAt:new Date(),voidedByMembershipId:actor.membershipId,voidReason:input.reason,updatedAt:new Date(Math.max(Date.now(),row.updatedAt.getTime()+1))}});
      const replacement = await tx.expense.create({data:{...where,replacementOfId:row.id,categoryId:category.id,title:input.title,description:input.description,amount:input.amount,expenseDate:new Date(`${input.date}T00:00:00Z`),recordedByMembershipId:actor.membershipId}});
      await audit(tx,actor,requestId,"EXPENSE_VOIDED","EXPENSE",row.id,{status:"VOIDED",reason:input.reason,replacementId:replacement.id},{status:"POSTED"});
      await audit(tx,actor,requestId,"EXPENSE_REPLACEMENT_DRAFTED","EXPENSE",replacement.id,{status:"DRAFT",replacementOfId:row.id,amount:money(cents(input.amount)),title:input.title});
      return {id:replacement.id};
    }
    if (input.action === "post") {
      if (row.status !== "DRAFT") conflict("Only draft expenses can be posted.");
      if(await tx.fileAttachment.count({where:{organizationId,expenseId:row.id,status:"PENDING",deletedAt:null}})) conflict("Complete or remove pending expense documents before posting.");
      await assertCurrentWriteAccess(tx,actor,"expense:post",{...resource(actor,input.projectId),expenseStatus:row.status,recordedByMembershipId:row.recordedByMembershipId});
      await tx.expense.update({where:{id:row.id},data:{status:"POSTED",postedAt:new Date(),updatedAt:new Date(Math.max(Date.now(),row.updatedAt.getTime()+1))}});
      await audit(tx,actor,requestId,"EXPENSE_POSTED","EXPENSE",row.id,{status:"POSTED",amount:row.amount.toFixed(2)},{status:"DRAFT"});
    } else {
      if (row.status !== "POSTED") conflict("Only posted expenses can be voided.");
      await tx.expense.update({where:{id:row.id},data:{status:"VOIDED",voidedAt:new Date(),voidedByMembershipId:actor.membershipId,voidReason:input.reason,updatedAt:new Date(Math.max(Date.now(),row.updatedAt.getTime()+1))}});
      await audit(tx,actor,requestId,"EXPENSE_VOIDED","EXPENSE",row.id,{status:"VOIDED",reason:input.reason},{status:"POSTED"});
    }
    return {id:row.id};
  });
}
