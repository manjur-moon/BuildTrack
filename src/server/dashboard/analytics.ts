import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthorizationContext } from "@/server/rbac/policy";
import { taskReadScope } from "@/server/construction/task-scope";
import { scopedInventoryWhere, canViewInventory } from "@/server/inventory/permissions";
import { dhakaDate } from "@/server/milestones/rules";
import { projectPermissionScope, sitePermissionScope, taskPermissionAvailable } from "./analytics-scope";
import { completionRate, monthlyWindows, portfolioFinance } from "./analytics-rules";

/** Server-only data path. Caller must resolve the authorization context from the current session. */
export async function loadDashboardAnalytics(actor: AuthorizationContext, now = new Date()) {
  const today = dhakaDate(now), boundary = new Date(`${today}T00:00:00Z`);
  const organizationId = actor.organizationId;
  const fullProjects = projectPermissionScope(actor, "project:view");
  const taskProjects = projectPermissionScope(actor, "task:view");
  const projects = { allowed: fullProjects.allowed && taskProjects.allowed,
    where: { AND: [fullProjects.where, taskProjects.where] } satisfies Prisma.ProjectWhereInput };
  const summaries = projectPermissionScope(actor, "project:summary:view");
  const finance = projectPermissionScope(actor, "expense:view");
  const sites = sitePermissionScope(actor, "site:view");
  const reports = sitePermissionScope(actor, "report:view");
  const canTasks = taskPermissionAvailable(actor);
  const canInventory = canViewInventory(actor);
  const taskScope = taskReadScope(actor);
  const unfinished: Prisma.TaskWhereInput = { status: { not: "COMPLETED" }, archivedAt: null };
  const overdue: Prisma.TaskWhereInput = { ...unfinished, dueOn: { lt: boundary } };
  const projectOpen: Prisma.ProjectWhereInput = { status: { notIn: ["COMPLETED", "CANCELLED"] } };
  return prisma.$transaction(async tx => {
    const result = {
      today,
      projects: projects.allowed ? await (async () => {
        const where = projects.where;
        const total = await tx.project.count({where});
        const active = await tx.project.count({where:{AND:[where,{status:"ACTIVE"}]}});
        const completed = await tx.project.count({where:{AND:[where,{status:"COMPLETED"}]}});
        const eligible = await tx.project.count({where:{AND:[where,{status:{not:"CANCELLED"}}]}});
        const delayed = await tx.project.count({where:{AND:[where,projectOpen,{expectedEndDate:{lt:boundary}}]}});
        const atRisk = await tx.project.count({where:{AND:[where,projectOpen,{expectedEndDate:{gt:boundary},tasks:{some:overdue}}]}});
        const rows = await tx.project.findMany({where,select:{id:true,name:true,status:true,expectedEndDate:true},orderBy:[{updatedAt:"desc"},{id:"desc"}],take:8});
        const progress = await tx.task.groupBy({by:["projectId"],where:{organizationId,archivedAt:null,projectId:{in:rows.map(r=>r.id)}},_avg:{progressPercent:true}});
        const milestonesWhere: Prisma.MilestoneWhereInput = {organizationId,project:{is:where},status:{not:"CANCELLED"}};
        const milestoneTotal = await tx.milestone.count({where:milestonesWhere});
        const milestoneAchieved = await tx.milestone.count({where:{AND:[milestonesWhere,{status:"ACHIEVED"}]}});
        return {total,active,completed,delayed,atRisk,completion:completionRate(completed,eligible),milestoneTotal,milestoneAchieved,
          recent:rows.map(r=>({id:r.id,name:r.name,status:r.status,due:r.expectedEndDate.toISOString().slice(0,10),progress:Number(progress.find(p=>p.projectId===r.id)?._avg.progressPercent??0)}))};
      })() : null,
      // Summary-only contractors may see project counts, never private project dates or all-project progress.
      summaryProjects: summaries.allowed ? await tx.project.count({where:summaries.where}) : null,
      tasks: canTasks ? await (async () => {
        const mine: Prisma.TaskWhereInput = {assignees:{some:{organizationId,membershipId:actor.membershipId,unassignedAt:null,projectMember:{is:{leftAt:null}}}}};
        const open = await tx.task.count({where:{AND:[taskScope,unfinished]}});
        const assigned = await tx.task.count({where:{AND:[taskScope,mine,unfinished]}});
        const blocked = await tx.task.count({where:{AND:[taskScope,unfinished,{incomingDependencies:{some:{predecessor:{is:{OR:[{status:{not:"COMPLETED"}},{archivedAt:{not:null}}]}}}}}]}});
        const late = await tx.task.count({where:{AND:[taskScope,overdue]}});
        const upcoming = await tx.task.findMany({where:{AND:[taskScope,mine,unfinished,{dueOn:{gte:boundary}}]},select:{id:true,title:true,dueOn:true,status:true},orderBy:[{dueOn:"asc"},{id:"asc"}],take:8});
        return {open,assigned,blocked,overdue:late,upcoming:upcoming.map(r=>({id:r.id,title:r.title,status:r.status,due:r.dueOn.toISOString().slice(0,10)}))};
      })() : null,
      sites: sites.allowed ? { active:await tx.constructionSite.count({where:{AND:[sites.where,{status:"ACTIVE"}]}}),total:await tx.constructionSite.count({where:sites.where}) } : null,
      reportsToday: reports.allowed ? await tx.dailyProgressReport.count({where:{organizationId,site:{is:reports.where},workDate:boundary}}) : null,
      ownReports: canTasks ? await tx.dailyProgressReport.count({where:{organizationId,reportedByMembershipId:actor.membershipId,task:{is:taskScope}}}) : null,
      inventory: canInventory ? await (async () => {
        const where: Prisma.SiteInventoryWhereInput = {organizationId,site:{is:scopedInventoryWhere(actor)},material:{is:{archivedAt:null}}};
        return {stockLines:await tx.siteInventory.count({where}),lowStock:await tx.siteInventory.count({where:{AND:[where,{reorderLevel:{gt:0},onHand:{lte:tx.siteInventory.fields.reorderLevel}}]}}),
          pendingRequests:await tx.materialRequest.count({where:{organizationId,site:{is:scopedInventoryWhere(actor)},status:"PENDING"}})};
      })() : null,
      finance: finance.allowed ? await (async () => {
        const where = {organizationId,project:{is:finance.where}};
        const budgets = await tx.projectBudget.findMany({where,select:{projectId:true,approvedAmount:true,currency:true}});
        // Do not combine unlike currencies, even if a database import introduced them.
        if(budgets.some(b=>b.currency!=="BDT")) throw new Error("Unsupported budget currency in dashboard totals.");
        const posted: Prisma.ExpenseWhereInput = {...where,status:"POSTED"};
        const expenses = await tx.expense.groupBy({by:["projectId"],where:posted,_sum:{amount:true}});
        const totals = portfolioFinance(budgets.map(b=>({projectId:b.projectId,amount:b.approvedAmount.toFixed(2)})),expenses.map(e=>({projectId:e.projectId,amount:e._sum.amount?.toFixed(2)??"0"})));
        const trend: {label:string;amount:string}[] = [];
        for(const w of monthlyWindows(today)) {
          const sum=await tx.expense.aggregate({where:{AND:[posted,{expenseDate:{gte:w.start,lt:w.end,lte:boundary}}]},_sum:{amount:true}});
          trend.push({label:w.label,amount:sum._sum.amount?.toFixed(2)??"0.00"});
        }
        return {...totals,trend};
      })() : null,
      roleLabels: [...new Set([...(actor.betterAuthRole==="owner"?["ADMIN"]:[]),...actor.grants.map(g=>g.role)])],
    };
    return result;
  }, {isolationLevel:"RepeatableRead",timeout:15000});
}
