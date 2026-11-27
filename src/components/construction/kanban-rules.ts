import type { Page } from "./api";

export const boardStatuses = ["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED"] as const;
export type BoardStatus = typeof boardStatuses[number];
export type BoardTask = {
  id: string; title: string; projectName: string; projectCode: string;
  siteName: string | null; priority: string; status: BoardStatus;
  blocked: boolean; progressPercent: number; dueOn: string; updatedAt: string;
  assignees: { id: string; name: string }[];
  canReportProgress: boolean; canApprove: boolean;
};
const workflow: Record<BoardStatus, readonly BoardStatus[]> = {
  TODO: ["IN_PROGRESS"], IN_PROGRESS: ["TODO", "REVIEW"],
  REVIEW: ["IN_PROGRESS", "COMPLETED"], COMPLETED: [],
};
export function isBoardStatus(value: unknown): value is BoardStatus {
  return boardStatuses.some((status) => status === value);
}
export function moveTargets(task: BoardTask): BoardStatus[] {
  if (!task.canReportProgress || !Number.isFinite(task.progressPercent) || task.progressPercent < 0 || task.progressPercent > 100) return [];
  return workflow[task.status].filter((status) => {
    if (status !== "TODO" && task.blocked) return false;
    if (status === "COMPLETED") return task.canApprove;
    if (status === "REVIEW") return task.progressPercent > 0 && task.progressPercent < 100;
    return status === "TODO" || task.progressPercent < 100;
  });
}
export function movePayload(task: BoardTask, target: BoardStatus) {
  if (!moveTargets(task).includes(target)) return null;
  return { expectedUpdatedAt: task.updatedAt, status: target,
    progressPercent: target === "COMPLETED" ? 100 : target === "TODO" ? 0 : task.progressPercent };
}
export function projectMove(task: BoardTask, target: BoardStatus): BoardTask {
  const payload = movePayload(task, target);
  if (!payload) return task;
  return { ...task, status: payload.status, progressPercent: payload.progressPercent,
    canReportProgress: target !== "COMPLETED" && task.canReportProgress,
    // Only a fresh server response may establish a new approval capability.
    canApprove: false };
}

export type BoardColumns = Record<BoardStatus, Page<BoardTask>>;
/** A projected view; never mutate the fetched snapshot (rollback discards the projection). */
export function relocateTask(columns: BoardColumns, original: BoardTask, replacement: BoardTask): BoardColumns {
  const source = original.status, target = replacement.status;
  if (source === target) return columns;
  const oldSource = columns[source], oldTarget = columns[target];
  const countSource = Math.max(0, oldSource.total - 1);
  const countTarget = oldTarget.total + 1;
  const pageWith = (base: Page<BoardTask>, items: BoardTask[], total: number): Page<BoardTask> => ({
    ...base, items, total, totalPages: Math.ceil(total / base.limit), hasNext: base.page * base.limit < total,
  });
  return { ...columns,
    [source]: pageWith(oldSource, oldSource.items.filter((item) => item.id !== original.id), countSource),
    [target]: pageWith(oldTarget, [replacement, ...oldTarget.items.filter((item) => item.id !== original.id)], countTarget),
  };
}
