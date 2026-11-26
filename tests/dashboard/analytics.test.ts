import { describe,expect,it } from "vitest";
import { completionRate, monthlyWindows, portfolioFinance } from "@/server/dashboard/analytics-rules";
import { projectPermissionScope,sitePermissionScope,taskPermissionAvailable } from "@/server/dashboard/analytics-scope";
import type { AuthorizationContext } from "@/server/rbac/policy";
const member:AuthorizationContext={organizationId:"org",membershipId:"member",membershipActive:true,emailVerified:true,betterAuthRole:"member",grants:[]};

describe("dashboard analytics rules",()=>{
  it("calculates completion rate without a zero denominator",()=>{expect(completionRate(2,3)).toBe("66.7");expect(completionRate(0,0)).toBeNull();});
  it("creates six non-overlapping month windows across years",()=>{const rows=monthlyWindows("2027-02-15");expect(rows.map(r=>r.label)).toEqual(["2026-09","2026-10","2026-11","2026-12","2027-01","2027-02"]);expect(rows[4].end).toEqual(rows[5].start);});
  it("uses exact monetary totals, tracks overruns and separates unbudgeted spend",()=>{
    expect(portfolioFinance([{projectId:"a",amount:"100.10"},{projectId:"b",amount:"200.20"}],[{projectId:"a",amount:"100.11"},{projectId:"c",amount:"15.25"}])).toEqual({approved:"300.30",actual:"115.36",remaining:"200.19",utilization:"33.34",unbudgetedSpend:"15.25",overBudget:1,budgetedProjects:2});
    expect(portfolioFinance([{projectId:"a",amount:"0"}],[{projectId:"a",amount:"1"}]).utilization).toBeNull();
    expect(portfolioFinance([],[]).remaining).toBeNull();
  });
  it("preserves project-scoped manager permissions and denies unassigned members",()=>{
    const pm:AuthorizationContext={...member,grants:[{organizationId:"org",role:"PROJECT_MANAGER",scope:"project",projectId:"p"}]};
    expect(projectPermissionScope(pm,"expense:view").where).toEqual({organizationId:"org",archivedAt:null,id:{in:["p"]}});
    expect(projectPermissionScope(member,"expense:view").allowed).toBe(false);
    expect(projectPermissionScope({...pm,membershipActive:false},"project:view").allowed).toBe(false);
  });
  it("limits engineer reports to the assigned project and site",()=>{
    const engineer:AuthorizationContext={...member,grants:[{organizationId:"org",role:"SITE_ENGINEER",scope:"site",projectId:"p",siteId:"s"}]};
    expect(sitePermissionScope(engineer,"report:view").where.OR).toEqual([{projectId:"p",id:"s"}]);
    expect(projectPermissionScope(engineer,"expense:view").allowed).toBe(false);
  });
  it("allows contractor summaries and assigned tasks without full project or finance access",()=>{
    const contractor:AuthorizationContext={...member,grants:[{organizationId:"org",role:"CONTRACTOR",scope:"project",projectId:"p"}]};
    expect(projectPermissionScope(contractor,"project:summary:view").allowed).toBe(true);
    expect(projectPermissionScope(contractor,"project:view").allowed).toBe(false);
    expect(projectPermissionScope(contractor,"task:view").allowed).toBe(false);
    expect(projectPermissionScope(contractor,"expense:view").allowed).toBe(false);
    expect(taskPermissionAvailable(contractor)).toBe(true);
  });
  it("denies cross-tenant and unverified grants",()=>{
    const invalid:AuthorizationContext={...member,grants:[{organizationId:"other",role:"FINANCE_MANAGER",scope:"organization"}]};
    expect(projectPermissionScope(invalid,"expense:view").allowed).toBe(false);
    expect(projectPermissionScope({...member,betterAuthRole:"owner",emailVerified:false},"expense:view").allowed).toBe(false);
  });
});
