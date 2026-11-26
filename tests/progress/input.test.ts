import {describe,it,expect} from "vitest";
import {reportInput,reportQuery} from "@/server/progress/input";
const base={projectId:"p",siteId:"s",taskId:"t",workDate:"2026-11-27",workDescription:"Foundation inspection",photoIds:[]};
describe("Daily progress validation",()=>{
 it("accepts precise observations",()=>{for(const observedProgress of ["0","0.01","99.99","100","100.00"])expect(reportInput.safeParse({...base,observedProgress}).success).toBe(true);});
 it("rejects invalid progress",()=>{for(const observedProgress of ["-1","101","100.01","1e2","2.001","NaN"])expect(reportInput.safeParse({...base,observedProgress}).success).toBe(false);});
 it("rejects duplicate evidence and untrusted actor",()=>{expect(reportInput.safeParse({...base,photoIds:["a","a"]}).success).toBe(false);expect(reportInput.safeParse({...base,reportedByMembershipId:"x"}).success).toBe(false);});
 it("validates dates and filters",()=>{expect(reportInput.safeParse({...base,workDate:"2026-02-30"}).success).toBe(false);expect(reportQuery.safeParse({projectId:"p",siteId:"s",from:"2026-12-01",to:"2026-01-01"}).success).toBe(false);});
});
