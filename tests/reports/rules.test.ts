import {describe,expect,it} from "vitest";
import {reportPage,completionPercent} from "@/server/reports/rules";
import {reportScope} from "@/server/reports/scope";
import type {AuthorizationContext} from "@/server/rbac/policy";
const actor:AuthorizationContext={organizationId:"org-a",membershipId:"member",betterAuthRole:"member",membershipActive:true,emailVerified:true,grants:[]};
describe("Step 13D.4 report rules",()=>{
  it("validates page bounds and duplicates",()=>{expect(reportPage(undefined)).toBe(1);expect(reportPage("9999")).toBe(9999);for(const p of ["0","-1","10000","1e2",["1","2"]])expect(reportPage(p)).toBeNull();});
  it("does not invent a completion rate for zero assigned tasks",()=>{expect(completionPercent(0,0)).toBeNull();expect(completionPercent(2,3)).toBe("66.7");});
  it("denies ordinary and inactive members and cross-org grants",()=>{for(const a of [actor,{...actor,membershipActive:false,betterAuthRole:"owner"},{...actor,grants:[{role:"ADMIN",scope:"organization",organizationId:"org-b"} as const]}])for(const k of ["finance","timeline","contractors"] as const)expect(reportScope(a,k).allowed).toBe(false);});
  it("denies full project reports to site engineers and contractors",()=>{for(const grant of [{role:"SITE_ENGINEER",scope:"site",organizationId:"org-a",projectId:"p",siteId:"s"},{role:"CONTRACTOR",scope:"project",organizationId:"org-a",projectId:"p"}] as const)for(const k of ["finance","timeline","contractors"] as const)expect(reportScope({...actor,grants:[grant]},k).allowed).toBe(false);});
  it("allows project manager only scoped reports and finance manager only finance",()=>{const pm={...actor,grants:[{role:"PROJECT_MANAGER",scope:"project",organizationId:"org-a",projectId:"p"} as const]};const fm={...actor,grants:[{role:"FINANCE_MANAGER",scope:"organization",organizationId:"org-a"} as const]};expect(reportScope(pm,"finance").where).toMatchObject({id:{in:["p"]}});expect(reportScope(pm,"timeline").allowed).toBe(true);expect(reportScope(pm,"contractors").allowed).toBe(true);expect(reportScope(fm,"finance").allowed).toBe(true);expect(reportScope(fm,"timeline").allowed).toBe(false);expect(reportScope(fm,"contractors").allowed).toBe(false);});
});
