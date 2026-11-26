import { describe,expect,it } from "vitest";
import { contractorInput,contractorQuery } from "../../src/server/contractors/input";
describe("Contractor input",()=>{
  it("accepts validated company profiles",()=>expect(contractorInput.safeParse({action:"create",name:"Cement Works",email:"office@example.test"}).success).toBe(true));
  it("rejects client organization and privilege fields",()=>expect(contractorInput.safeParse({action:"grant",contractorId:"c",projectId:"p",membershipId:"m",organizationId:"foreign",role:"ADMIN"}).success).toBe(false));
  it("rejects invalid status and page",()=>{expect(contractorInput.safeParse({action:"status",contractorId:"c",status:"UNKNOWN"}).success).toBe(false);expect(contractorQuery.safeParse({page:"0"}).success).toBe(false);});
  it("requires all assignment identifiers",()=>expect(contractorInput.safeParse({action:"grant",contractorId:"c",projectId:"p"}).success).toBe(false));
});
