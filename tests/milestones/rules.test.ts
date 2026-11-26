import {describe,it,expect} from "vitest";
import {dhakaDate,isOverdue,canTransition} from "@/server/milestones/rules";
import {milestoneInput} from "@/server/milestones/input";
describe("Milestone rules",()=>{
 it("uses Dhaka calendar boundaries",()=>expect(dhakaDate(new Date("2026-11-26T18:00:00Z"))).toBe("2026-11-27"));
 it("marks only planned milestones overdue after their deadline",()=>{expect(isOverdue("PLANNED","2026-11-26","2026-11-27")).toBe(true);expect(isOverdue("PLANNED","2026-11-27","2026-11-27")).toBe(false);expect(isOverdue("ACHIEVED","2026-11-26","2026-11-27")).toBe(false);});
 it("rejects premature missed and terminal transitions",()=>{expect(canTransition("PLANNED","MISSED","2026-11-27","2026-11-27")).toBe(false);expect(canTransition("PLANNED","MISSED","2026-11-26","2026-11-27")).toBe(true);expect(canTransition("ACHIEVED","CANCELLED","2026-11-26","2026-11-27")).toBe(false);});
 it("validates dates and unknown fields",()=>{const input={action:"create",projectId:"p",title:"Foundation",dueDate:"2026-02-28"};expect(milestoneInput.safeParse(input).success).toBe(true);expect(milestoneInput.safeParse({...input,dueDate:"2026-02-30"}).success).toBe(false);expect(milestoneInput.safeParse({...input,organizationId:"foreign"}).success).toBe(false);});
});
