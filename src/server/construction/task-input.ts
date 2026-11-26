import { z } from "zod";
import { ApiError } from "@/server/api/errors";

const id = z.string().trim().min(1).max(128);
const text = z.string().trim().min(3).max(160);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");
const stamp = z.iso.datetime({ offset: true });
const priority = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const status = z.enum(["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED"]);
const progress = z.number().finite().min(0).max(100).multipleOf(0.01);

export const createTaskSchema = z.strictObject({
  projectId: id,
  siteId: id.nullable().optional(),
  title: text,
  description: z.string().trim().max(3000).nullable().optional(),
  priority: priority.default("MEDIUM"),
  startsOn: dateOnly.nullable().optional(),
  dueOn: dateOnly,
}).refine((value) => !value.startsOn || value.startsOn <= value.dueOn,
  { path: ["dueOn"], message: "Due date must not precede start date." });

export const updateTaskSchema = z.strictObject({
  expectedUpdatedAt: stamp,
  title: text.optional(),
  description: z.string().trim().max(3000).nullable().optional(),
  priority: priority.optional(),
  startsOn: dateOnly.nullable().optional(),
  dueOn: dateOnly.optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "expectedUpdatedAt"),
  "At least one task field must change.");

export const updateTaskProgressSchema = z.strictObject({
  expectedUpdatedAt: stamp,
  status,
  progressPercent: progress,
  note: z.string().trim().max(500).optional(),
});

export const taskAssigneeSchema = z.strictObject({ membershipId: id });
export const archiveTaskSchema = z.strictObject({
  expectedUpdatedAt: stamp,
  reason: z.string().trim().min(10).max(500),
});

export type CreateTaskInput = z.output<typeof createTaskSchema>;
export type UpdateTaskInput = z.output<typeof updateTaskSchema>;
export type UpdateTaskProgressInput = z.output<typeof updateTaskProgressSchema>;
export type ArchiveTaskInput = z.output<typeof archiveTaskSchema>;
export type TaskStatus = z.output<typeof status>;

export type TaskListQuery = {
  q: string; page: number; limit: number; status?: TaskStatus;
  priority?: z.output<typeof priority>; projectId?: string; siteId?: string;
  from?: string; to?: string; mine: boolean;
  sortBy: "dueOn" | "createdAt" | "priority" | "status" | "title";
  order: "asc" | "desc";
};

function invalid(message: string): never { throw new ApiError(422, "VALIDATION_ERROR", message); }
function intParam(raw: string | null, fallback: number, max: number): number {
  if (raw === null) return fallback;
  if (!/^[1-9]\d*$/.test(raw)) return invalid("Pagination must use positive integers.");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > max) return invalid(`Pagination must not exceed ${max}.`);
  return value;
}
export function parseTaskListQuery(params: URLSearchParams): TaskListQuery {
  const allowed = ["q", "page", "limit", "status", "priority", "projectId", "siteId", "from", "to", "mine", "sortBy", "order"];
  for (const [key] of params) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) invalid("Unknown or duplicate query parameter.");
  }
  const q = params.get("q")?.trim() ?? "";
  if (q.length > 100) invalid("Search length exceeds 100 characters.");
  const statusValue = params.get("status") || undefined;
  const priorityValue = params.get("priority") || undefined;
  const projectId = params.get("projectId") || undefined;
  const siteId = params.get("siteId") || undefined;
  if (statusValue && !status.options.includes(statusValue as TaskStatus)) invalid("Unknown task status.");
  if (priorityValue && !priority.options.includes(priorityValue as z.output<typeof priority>)) invalid("Unknown task priority.");
  if (projectId && !id.safeParse(projectId).success) invalid("Invalid project ID.");
  if (siteId && !id.safeParse(siteId).success) invalid("Invalid site ID.");
  const from = params.get("from") || undefined;
  const to = params.get("to") || undefined;
  if (from && !dateOnly.safeParse(from).success) invalid("Invalid from date.");
  if (to && !dateOnly.safeParse(to).success) invalid("Invalid to date.");
  if (from && to && from > to) invalid("Invalid due-date range.");
  const mine = params.get("mine") ?? "false";
  if (mine !== "true" && mine !== "false") invalid("Invalid mine filter.");
  const sortBy = params.get("sortBy") ?? "dueOn";
  if (!["dueOn", "createdAt", "priority", "status", "title"].includes(sortBy)) invalid("Invalid sort field.");
  const order = params.get("order") ?? "asc";
  if (order !== "asc" && order !== "desc") invalid("Invalid sort order.");
  return {
    q, status: statusValue as TaskStatus | undefined,
    priority: priorityValue as z.output<typeof priority> | undefined, projectId, siteId,
    from, to, mine: mine === "true", sortBy: sortBy as TaskListQuery["sortBy"], order,
    page: intParam(params.get("page"), 1, 10000), limit: intParam(params.get("limit"), 20, 100),
  };
}

const workflow: Record<TaskStatus, readonly TaskStatus[]> = {
  TODO: ["IN_PROGRESS"],
  IN_PROGRESS: ["TODO", "REVIEW"],
  REVIEW: ["IN_PROGRESS", "COMPLETED"],
  COMPLETED: [],
};
/** Pure workflow validator; approval is separately checked against RBAC. */
export function validateProgressTransition(
  from: TaskStatus, to: TaskStatus, value: number, canApprove: boolean,
): void {
  if (from !== to && !workflow[from].includes(to)) invalid(`Transition ${from} → ${to} is not allowed.`);
  if (to === "COMPLETED" && !canApprove) throw new ApiError(403, "FORBIDDEN", "Only a project manager or administrator can approve completion.");
  if (to === "COMPLETED" && value !== 100) invalid("Completed tasks must have 100% progress.");
  if (to !== "COMPLETED" && value >= 100) invalid("Only completed tasks may have 100% progress.");
  if (to === "TODO" && value !== 0) invalid("TODO tasks must have 0% progress.");
  if (to === "REVIEW" && value <= 0) invalid("Progress must be greater than zero before review.");
  if (from === "COMPLETED") throw new ApiError(409, "CONFLICT", "Completed tasks are locked. Reopen requires a separate approval workflow.");
}
