import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthorizationContext } from "@/server/rbac/policy";
import { financialTotals } from "@/server/finance/money";
import { monthlyWindows } from "@/server/dashboard/analytics-rules";
import { dhakaDate } from "@/server/milestones/rules";
import { REPORT_PAGE_SIZE, completionPercent, dateLabel } from "./rules";
import { reportScope, type ReportKind } from "./scope";
export { reportScope, type ReportKind } from "./scope";
const selection = { id:true, name:true, code:true, status:true, startDate:true, expectedEndDate:true } as const;
export async function reportProjects(actor: AuthorizationContext, kind: ReportKind, q: string, page: number) {
  const scope = reportScope(actor, kind);
  if (!scope.allowed) return null;
  const where: Prisma.ProjectWhereInput = { AND: [scope.where, ...(q ? [{ OR: [{ name: { contains:q, mode:"insensitive" as const } }, { code: { contains:q, mode:"insensitive" as const } }] }] : [])] };
  return prisma.$transaction(async tx => ({ total: await tx.project.count({where}), items: await tx.project.findMany({where,select:selection,orderBy:[{name:"asc"},{id:"asc"}],skip:(page-1)*REPORT_PAGE_SIZE,take:REPORT_PAGE_SIZE}) }), {isolationLevel:"RepeatableRead"});
}
export async function projectReport(actor: AuthorizationContext, kind: ReportKind, projectId: string, page: number, now = new Date()) {
  const scope = reportScope(actor, kind);
  if (!scope.allowed) return null;
  const organizationId = actor.organizationId;
  const today = dhakaDate(now), boundary = new Date(`${today}T00:00:00Z`);
  const base = { organizationId, projectId };
  const window = {skip:(page-1)*REPORT_PAGE_SIZE,take:REPORT_PAGE_SIZE};
  return prisma.$transaction(async tx => {
    const project = await tx.project.findFirst({where:{AND:[scope.where,{id:projectId}]},select:selection});
    if (!project) return null;
    if (kind === "finance") {
      const budget = await tx.projectBudget.findFirst({where:base,select:{approvedAmount:true,currency:true}});
      if (budget && budget.currency !== "BDT") throw new Error("Unsupported report currency");
      const posted = {...base,status:"POSTED" as const};
      const sum = await tx.expense.aggregate({where:posted,_sum:{amount:true}});
      const totals = financialTotals(budget?.approvedAmount.toFixed(2)??null,sum._sum.amount?.toFixed(2)??"0.00");
      const trend: {label:string;amount:string}[] = [];
      for(const w of monthlyWindows(today,12)) {
        const m = await tx.expense.aggregate({where:{...posted,expenseDate:{gte:w.start,lt:w.end,lte:boundary}},_sum:{amount:true}});
        trend.push({label:w.label,amount:m._sum.amount?.toFixed(2)??"0.00"});
      }
      const total = await tx.expense.count({where:posted});
      const items = await tx.expense.findMany({where:posted,select:{id:true,title:true,amount:true,expenseDate:true,category:{select:{name:true}}},orderBy:[{expenseDate:"desc"},{id:"desc"}],...window});
      return {kind:"finance" as const,project,totals,trend,total,items:items.map(x=>({...x,amount:x.amount.toFixed(2),expenseDate:dateLabel(x.expenseDate)}))};
    }
    if(kind === "timeline") {
      const where = {...base,archivedAt:null};
      const total = await tx.task.count({where});
      const avg = await tx.task.aggregate({where,_avg:{progressPercent:true}});
      const tasks = await tx.task.findMany({where,select:{id:true,title:true,status:true,startsOn:true,dueOn:true,progressPercent:true},orderBy:[{dueOn:"asc"},{id:"asc"}],...window});
      const milestoneTotal = await tx.milestone.count({where:base});
      const milestones = await tx.milestone.findMany({where:base,select:{id:true,title:true,status:true,dueDate:true,achievedAt:true},orderBy:[{dueDate:"asc"},{id:"asc"}],...window});
      return {kind:"timeline" as const,project,today,total,milestoneTotal,progress:avg._avg.progressPercent?.toFixed(2)??"0.00",tasks:tasks.map(t=>({...t,progressPercent:t.progressPercent.toFixed(2)})),milestones};
    }
    // Current company/project affiliations only. Count distinct tasks, not assignment rows.
    const where = {...base,endedAt:null};
    const total = await tx.projectContractorAssignment.count({where});
    const companies = await tx.projectContractorAssignment.findMany({where,select:{contractor:{select:{id:true,name:true,status:true,users:{where:{organizationId,endedAt:null},select:{membershipId:true}}}}},orderBy:{id:"asc"},...window});
    const items = [];
    for(const {contractor:c} of companies){
      const tasks: Prisma.TaskWhereInput = {...base,archivedAt:null,assignees:{some:{organizationId,unassignedAt:null,membershipId:{in:c.users.map(u=>u.membershipId)},projectMember:{is:{leftAt:null}}}}};
      const assigned = await tx.task.count({where:tasks});
      const completed = await tx.task.count({where:{AND:[tasks,{status:"COMPLETED"}]}});
      const overdue = await tx.task.count({where:{AND:[tasks,{status:{not:"COMPLETED"},dueOn:{lt:boundary}}]}});
      items.push({id:c.id,name:c.name,status:c.status,assigned,completed,overdue,completion:completionPercent(completed,assigned)});
    }
    return {kind:"contractors" as const,project,total,items};
  }, {isolationLevel:"RepeatableRead",timeout:15000});
}
