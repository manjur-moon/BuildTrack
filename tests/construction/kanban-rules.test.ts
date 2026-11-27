import { describe, expect, it } from "vitest";
import { boardStatuses, isBoardStatus, movePayload, moveTargets, projectMove, relocateTask,
  type BoardTask, type BoardColumns } from "../../src/components/construction/kanban-rules";
import type { Page } from "../../src/components/construction/api";
const task = (extra: Partial<BoardTask> = {}): BoardTask => ({
  id: "a", title: "Foundation", projectName: "Tower", projectCode: "T1", siteName: "Site A",
  priority: "HIGH", status: "TODO", blocked: false, progressPercent: 0,
  dueOn: "2027-01-01", updatedAt: "2026-11-27T00:00:00.000Z", assignees: [],
  canReportProgress: true, canApprove: false, ...extra,
});
const page = (items: BoardTask[]): Page<BoardTask> => ({ items, page: 1, limit: 20, total: items.length, totalPages: items.length ? 1 : 0, hasPrevious: false, hasNext: false });
describe("Step 13D.2 Kanban workflow hints and optimistic projection", () => {
  it("uses only adjacent workflow transitions, no no-ops", () => {
    expect(moveTargets(task())).toEqual(["IN_PROGRESS"]);
    expect(moveTargets(task({ status: "IN_PROGRESS", progressPercent: 40 }))).toEqual(["TODO", "REVIEW"]);
    expect(moveTargets(task({ status: "REVIEW", progressPercent: 90, canApprove: true }))).toEqual(["IN_PROGRESS", "COMPLETED"]);
    expect(moveTargets(task({ status: "COMPLETED", progressPercent: 100 }))).toEqual([]);
    expect(movePayload(task(), "COMPLETED")).toBeNull();
  });
  it("does not permit blocked tasks to advance or read-only users to move", () => {
    expect(moveTargets(task({ blocked: true }))).toEqual([]);
    expect(moveTargets(task({ status: "IN_PROGRESS", blocked: true, progressPercent: 10 }))).toEqual(["TODO"]);
    expect(moveTargets(task({ canReportProgress: false }))).toEqual([]);
  });
  it("requires positive progress for review and approval permission for completion", () => {
    expect(moveTargets(task({ status: "IN_PROGRESS" }))).toEqual(["TODO"]);
    expect(moveTargets(task({ status: "REVIEW", progressPercent: 80 }))).toEqual(["IN_PROGRESS"]);
  });
  it("uses the server version stamp and preserves progress unless resetting or approving", () => {
    const t = task({ status: "IN_PROGRESS", progressPercent: 32.75 });
    expect(movePayload(t, "REVIEW")).toEqual({ status: "REVIEW", progressPercent: 32.75, expectedUpdatedAt: t.updatedAt });
    expect(movePayload(t, "TODO")?.progressPercent).toBe(0);
    expect(movePayload(task({ status: "REVIEW", canApprove: true, progressPercent: 95 }), "COMPLETED")?.progressPercent).toBe(100);
  });
  it("does not invent new approval privileges in an optimistic projection", () => {
    const t = task({ status: "IN_PROGRESS", progressPercent: 20 });
    const projection = projectMove(t, "REVIEW");
    expect(projection.status).toBe("REVIEW"); expect(projection.canApprove).toBe(false);
    expect(t.status).toBe("IN_PROGRESS");
  });
  it("moves a card without mutating the original pages, allowing rollback", () => {
    const t = task(); const base: BoardColumns = { TODO: page([t]), IN_PROGRESS: page([]), REVIEW: page([]), COMPLETED: page([]) };
    const next = relocateTask(base, t, projectMove(t, "IN_PROGRESS"));
    expect(next.TODO.items).toEqual([]); expect(next.TODO.total).toBe(0);
    expect(next.IN_PROGRESS.items[0].status).toBe("IN_PROGRESS"); expect(next.IN_PROGRESS.total).toBe(1);
    expect(base.TODO.items).toEqual([t]); expect(base.IN_PROGRESS.items).toEqual([]);
  });
  it("rejects non-status drop identifiers and non-finite progress", () => {
    expect(boardStatuses.every(isBoardStatus)).toBe(true); expect(isBoardStatus("outside")).toBe(false);
    expect(moveTargets(task({ progressPercent: NaN }))).toEqual([]);
  });
});
