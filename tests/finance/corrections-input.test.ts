import {describe,expect,it} from "vitest";
import {financeInput} from "@/server/finance/input";
import {createProjectSchema} from "@/server/construction/input";
const draft={projectId:"p",categoryId:"c",title:"Concrete invoice",amount:"12.50",date:"2026-11-27"};
const existing={expenseId:"e",expectedUpdatedAt:"2026-11-27T10:00:00.000Z"};
const project={name:"Project A",code:"PA",location:"Dhaka",startDate:"2026-01-01",expectedEndDate:"2027-01-01"};
describe("Step 13E.2A financial corrections validation",()=>{
  it("requires an optimistic version for edit, post, void and replace",()=>{
    for(const action of ["edit","post","void","replace"]){
      const payload=action==="edit"||action==="replace"?{...draft,expenseId:"e",action,...(action==="replace"?{reason:"Correction reason"}:{})}:{projectId:"p",expenseId:"e",action,...(action==="void"?{reason:"Correction reason"}:{})};
      expect(financeInput.safeParse(payload).success).toBe(false);
      expect(financeInput.safeParse({...payload,...existing}).success).toBe(true);
    }
  });
  it("rejects zero, negative, overflow and forged correction fields",()=>{
    const base={...draft,...existing,action:"replace",reason:"Correction reason"};
    for(const amount of ["0","-1","1.001","10000000000000000"])expect(financeInput.safeParse({...base,amount}).success).toBe(false);
    expect(financeInput.safeParse({...base,replacementOfId:"other"}).success).toBe(false);
    expect(financeInput.safeParse({...base,reason:"short"}).success).toBe(false);
  });
  it("allows an optional exact nonnegative initial budget and rejects invalid values",()=>{
    expect(createProjectSchema.safeParse(project).success).toBe(true);
    for(const initialBudget of ["0","1234.56","9999999999999999.99"])expect(createProjectSchema.safeParse({...project,initialBudget}).success).toBe(true);
    for(const initialBudget of ["-1","1.001","10000000000000000"])expect(createProjectSchema.safeParse({...project,initialBudget}).success).toBe(false);
  });
});
