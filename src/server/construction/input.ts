import { z } from "zod";

const safeName = z.string().trim().min(2).max(140);
const location = z.string().trim().min(2).max(240);
const id = z.string().trim().min(1).max(128);

/** Date-only strings are retained as UTC midnight, never parsed in the browser's local zone. */
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");
const stamp = z.iso.datetime({ offset: true });
const nullableDate = dateOnly.nullable();
const projectStatus = z.enum(["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"]);
const siteStatus = z.enum(["PLANNED", "ACTIVE", "ON_HOLD", "CLOSED"]);

export const createProjectSchema = z.strictObject({
  name: safeName,
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,23}$/, "2–24 letters, numbers, - or _"),
  description: z.string().trim().max(3000).nullable().optional(),
  location,
  startDate: dateOnly,
  expectedEndDate: dateOnly,
  initialBudget: z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/).optional(),
}).refine((value) => value.startDate <= value.expectedEndDate,
  { path: ["expectedEndDate"], message: "Expected end cannot precede start" });

export const updateProjectSchema = z.strictObject({
  expectedUpdatedAt: stamp,
  name: safeName.optional(),
  description: z.string().trim().max(3000).nullable().optional(),
  location: location.optional(),
  startDate: dateOnly.optional(),
  expectedEndDate: dateOnly.optional(),
  actualEndDate: nullableDate.optional(),
  status: projectStatus.optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "expectedUpdatedAt"),
  { message: "At least one project field is required" });

export const createSiteSchema = z.strictObject({
  projectId: id,
  name: safeName,
  location,
});

export const updateSiteSchema = z.strictObject({
  expectedUpdatedAt: stamp,
  name: safeName.optional(),
  location: location.optional(),
  status: siteStatus.optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "expectedUpdatedAt"),
  { message: "At least one site field is required" });

export const archiveSchema = z.strictObject({ expectedUpdatedAt: stamp });
export const entityIdSchema = id;

export type CreateProjectInput = z.output<typeof createProjectSchema>;
export type UpdateProjectInput = z.output<typeof updateProjectSchema>;
export type CreateSiteInput = z.output<typeof createSiteSchema>;
export type UpdateSiteInput = z.output<typeof updateSiteSchema>;

export function checkProjectDates(start: string, end: string, actual: string | null, status: string) {
  if (end < start) return "Expected end cannot precede start";
  if (actual && actual < start) return "Actual end cannot precede start";
  if (status === "COMPLETED" && !actual) return "Completion requires an actual end date";
  if (status !== "COMPLETED" && actual) return "Actual end date requires COMPLETED status";
  return null;
}
