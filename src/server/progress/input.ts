import { z } from "zod";
const id=z.string().trim().min(1).max(128);
export const reportInput=z.strictObject({projectId:id,siteId:id,taskId:id.optional(),workDate:z.iso.date(),workDescription:z.string().trim().min(3).max(4000),delayReason:z.string().trim().max(2000).optional(),observedProgress:z.string().regex(/^(?:100(?:\.0{1,2})?|(?:0|[1-9]\d?)(?:\.\d{1,2})?)$/).optional(),photoIds:z.array(id).max(10).refine(a=>new Set(a).size===a.length,"Duplicate photos").default([])});
export const reportQuery=z.strictObject({projectId:id,siteId:id,taskId:id.optional(),page:z.string().regex(/^[1-9]\d{0,3}$/).default("1"),q:z.string().trim().max(120).default(""),from:z.iso.date().optional(),to:z.iso.date().optional()}).refine(v=>!v.from||!v.to||v.from<=v.to,"Invalid date range");
export type ReportInput=z.output<typeof reportInput>;
export type ReportQuery=z.output<typeof reportQuery>;
