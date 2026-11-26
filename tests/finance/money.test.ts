import { describe,expect,it } from "vitest";
import { cents,money,financialTotals } from "@/server/finance/money";
import { financeInput } from "@/server/finance/input";
import { hasPermission,type AuthorizationContext } from "@/server/rbac/policy";
describe("Step 13B finance",()=>{
  it("keeps decimal precision at maximum individual amount",()=>expect(money(cents("9999999999999999.99"))).toBe("9999999999999999.99"));
  it("calculates overrun without floating point",()=>expect(financialTotals("100","125.25")).toEqual({approved:"100.00",actual:"125.25",remaining:"-25.25",utilization:"125.25",overrun:"25.25"}));
  it("handles missing and zero budgets",()=>{expect(financialTotals(null,"10").remaining).toBeNull();expect(financialTotals("0","10").utilization).toBeNull();});
  it("rounds utilization",()=>expect(financialTotals("3","1").utilization).toBe("33.33"));
  it("rejects invalid decimal formats and zero expense",()=>{for(const amount of ["1e4","-1","0","1.001","10000000000000000"]){expect(financeInput.safeParse({action:"draft",projectId:"p",categoryId:"c",title:"Test",amount,date:"2026-11-27"}).success).toBe(false);}});
  it("allows finance revisions, not project manager revisions",()=>{
    const ctx:AuthorizationContext={organizationId:"a",membershipId:"m",membershipActive:true,emailVerified:true,betterAuthRole:"member",grants:[{role:"FINANCE_MANAGER",scope:"project",organizationId:"a",projectId:"p"}]};
    expect(hasPermission(ctx,"expense:manage",{organizationId:"a",projectId:"p"})).toBe(true);
    expect(hasPermission(ctx,"expense:manage",{organizationId:"a",projectId:"q"})).toBe(false);
    expect(hasPermission({...ctx,grants:[{role:"PROJECT_MANAGER",scope:"project",organizationId:"a",projectId:"p"}]},"expense:manage",{organizationId:"a",projectId:"p"})).toBe(false);
  });
});
