"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, pointerWithin,
  useDraggable, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent } from "@dnd-kit/core";
import { api, jsonRequest, type Page } from "./api";
import { boardStatuses, isBoardStatus, movePayload, moveTargets, projectMove, relocateTask,
  type BoardStatus, type BoardTask, type BoardColumns } from "./kanban-rules";

const labels: Record<BoardStatus, string> = {
  TODO: "To do", IN_PROGRESS: "In progress", REVIEW: "Review", COMPLETED: "Completed",
};
type Columns = BoardColumns;
type Pages = Record<BoardStatus, number>;
const firstPages = (): Pages => ({ TODO: 1, IN_PROGRESS: 1, REVIEW: 1, COMPLETED: 1 });
const pageSize = 20;
// Pointer releases outside a column must cancel, not select the nearest column.
const detectCollision: CollisionDetection = (args) => args.pointerCoordinates ? pointerWithin(args) : closestCenter(args);

function Column({ status, page, dropAllowed, children, onPage, disabled }: {
  status: BoardStatus; page: Page<BoardTask>; dropAllowed: boolean;
  children: ReactNode; onPage: (page: number) => void; disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: !dropAllowed || disabled });
  return <section ref={setNodeRef} className={`bt-kanban-column${isOver && dropAllowed ? " bt-kanban-over" : ""}`}
    aria-label={`${labels[status]} tasks`}>
    <header><h2>{labels[status]}</h2><span aria-label={`${page.total} tasks`}>{page.total}</span></header>
    <div className="bt-kanban-cards">{children}</div>
    <footer><button type="button" disabled={disabled || page.page <= 1} onClick={() => onPage(page.page - 1)}>Previous</button>
      <small>Page {page.page} / {Math.max(page.totalPages, 1)}</small>
      <button type="button" disabled={disabled || !page.hasNext || page.page >= 10000} onClick={() => onPage(page.page + 1)}>Next</button></footer>
  </section>;
}

function TaskCard({ task, disabled, pending, onMove }: {
  task: BoardTask; disabled: boolean; pending: boolean; onMove: (task: BoardTask, status: BoardStatus) => void;
}) {
  const targets = moveTargets(task);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: task.id, disabled: disabled || targets.length === 0,
  });
  return <article ref={setNodeRef} className={`bt-kanban-card${isDragging ? " bt-kanban-dragging" : ""}`}
    style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}>
    <div className="bt-kanban-card-top"><span className="bt-crud-tag">{task.priority}</span>
      {targets.length > 0 && <button ref={setActivatorNodeRef} type="button" className="bt-kanban-handle" disabled={disabled}
        {...attributes} {...listeners} aria-label={`Drag ${task.title}`}>⠿ Drag</button>}</div>
    <h3>{task.title}</h3><p>{task.projectCode} · {task.siteName ?? "Project work"}</p>
    {task.blocked && <p className="bt-kanban-warning">Blocked by prerequisite</p>}
    <label className="bt-kanban-progress"><span>Progress {task.progressPercent}%</span>
      <progress max={100} value={task.progressPercent} /></label>
    <p>Due {task.dueOn}</p><p>{task.assignees.map((person) => person.name).join(", ") || "Unassigned"}</p>
    {pending ? <p role="status">Saving move…</p> : <div className="bt-kanban-actions">
      {targets.map((status) => <button key={status} type="button" disabled={disabled} onClick={() => onMove(task, status)}
        aria-label={`Move ${task.title} to ${labels[status]}`}>{labels[status]} →</button>)}
      {task.status === "IN_PROGRESS" && task.progressPercent === 0 && task.canReportProgress && !task.blocked && <small>Record positive progress in the task list before review.</small>}
      {task.status === "REVIEW" && !task.canApprove && <small>Completion requires manager approval.</small>}
    </div>}
  </article>;
}

export function KanbanBoard() {
  const [search, setSearch] = useState("");
  const [mine, setMine] = useState(false);
  const [priority, setPriority] = useState("");
  const [filters, setFilters] = useState({ q: "", mine: false, priority: "" });
  const [pages, setPages] = useState<Pages>(firstPages);
  const [revision, setRevision] = useState(0);
  const queryKey = JSON.stringify({ filters, pages });
  const requestKey = `${queryKey}:${revision}`;
  const [loaded, setLoaded] = useState<{ queryKey: string; requestKey: string; columns: Columns } | null>(null);
  const [loadError, setLoadError] = useState<{ requestKey: string; message: string } | null>(null);
  const [moveError, setMoveError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<{ task: BoardTask; target: BoardStatus } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const writeLock = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));
  const ready = loaded?.requestKey === requestKey;
  const failed = loadError?.requestKey === requestKey;
  const loading = !ready && !failed;
  const columns = loaded?.queryKey === queryKey && !failed ? loaded.columns : null;
  const locked = !ready || !!pending || !!activeId;
  const tasks = columns ? boardStatuses.flatMap((status) => columns[status].items) : [];
  const displayed = columns && pending ? relocateTask(columns, pending.task, projectMove(pending.task, pending.target)) : columns;
  const activeTask = tasks.find((task) => task.id === activeId);
  const validTargets = activeTask ? moveTargets(activeTask) : [];

  useEffect(() => {
    const controller = new AbortController();
    const get = async (status: BoardStatus) => {
      const params = new URLSearchParams({ status, page: String(pages[status]), limit: String(pageSize),
        q: filters.q, mine: String(filters.mine), sortBy: "dueOn", order: "asc" });
      if (filters.priority) params.set("priority", filters.priority);
      return api<Page<BoardTask>>(`/api/v1/tasks?${params}`, { signal: controller.signal });
    };
    Promise.all(boardStatuses.map(get)).then(([TODO, IN_PROGRESS, REVIEW, COMPLETED]) => {
      if (!controller.signal.aborted) setLoaded({ requestKey, queryKey, columns: { TODO, IN_PROGRESS, REVIEW, COMPLETED } });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadError({ requestKey, message: error instanceof Error ? error.message : "Unable to load board." });
    });
    return () => controller.abort();
  }, [filters, pages, queryKey, requestKey]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || writeLock.current || activeId) return;
    setFilters({ q: search.trim(), mine, priority }); setPages(firstPages());
    setRevision((value) => value + 1); setMoveError(""); setNotice("");
  }
  function changePage(status: BoardStatus, page: number) {
    if (locked || writeLock.current) return;
    setPages((current) => ({ ...current, [status]: page })); setNotice("");
  }
  async function move(task: BoardTask, target: BoardStatus) {
    if (!ready || pending || writeLock.current) return;
    const payload = movePayload(task, target);
    if (!payload) { setMoveError("This workflow move is not permitted. Check prerequisites, progress and permissions."); return; }
    if (target === "COMPLETED" && !window.confirm(`Approve completion of “${task.title}”? This sets progress to 100%.`)) return;
    if (target === "TODO" && task.progressPercent > 0 && !window.confirm(`Return “${task.title}” to To do and reset progress to 0%?`)) return;
    writeLock.current = true; setMoveError(""); setNotice(""); setPending({ task, target });
    try {
      const saved = await api<BoardTask>(`/api/v1/tasks/${encodeURIComponent(task.id)}/status`, jsonRequest("PATCH", payload));
      setLoaded((current) => current?.requestKey === requestKey ?
        { ...current, columns: relocateTask(current.columns, task, saved) } : current);
      setNotice("Task moved. Refreshing authoritative task data.");
    } catch (error) {
      setMoveError(`${error instanceof Error ? error.message : "Move failed."} The optimistic move was rolled back. Refreshing server data to verify the final state.`);
    } finally {
      setPending(null); setRevision((value) => value + 1); writeLock.current = false;
    }
  }
  function endDrag(event: DragEndEvent) {
    setActiveId(null);
    const task = tasks.find((item) => item.id === event.active.id);
    const target = event.over?.id;
    if (task && isBoardStatus(target) && target !== task.status) void move(task, target);
  }
  return <div className="bt-crud bt-kanban">
    <header className="bt-crud-heading"><div><p className="bt-section-kicker">BUILDTRACK / OPERATIONS</p>
      <h1>Kanban board<span className="bt-module-dot">.</span></h1><p>Move authorized tasks through the construction workflow. Each column loads 20 tasks at a time.</p></div>
      <Link className="bt-kanban-link" href="/dashboard/tasks">Task list / details →</Link></header>
    <form className="bt-kanban-filters" onSubmit={applyFilters}>
      <label>Search tasks<input type="search" maxLength={100} value={search} disabled={!!pending || !!activeId} onChange={(event) => setSearch(event.target.value)} /></label>
      <label>Priority<select value={priority} disabled={!!pending || !!activeId} onChange={(event) => setPriority(event.target.value)}>
        <option value="">All priorities</option>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <label className="bt-kanban-mine"><input type="checkbox" checked={mine} disabled={!!pending || !!activeId} onChange={(event) => setMine(event.target.checked)} /> Assigned to me</label>
      <button className="bt-crud-primary" type="submit" disabled={!!pending || !!activeId}>Apply filters</button>
      <button type="button" disabled={!!pending || !!activeId || loading} onClick={() => { setRevision((value) => value + 1); setNotice(""); }}>Refresh</button>
    </form>
    <p className="bt-kanban-help">Drag using the handle or use the move buttons (keyboard and touch accessible). Review requires positive progress; completion requires approval. Return to the task list for detailed editing.</p>
    {moveError && <p className="bt-crud-feedback" role="alert">{moveError}</p>}
    {failed && loadError && <p className="bt-crud-feedback" role="alert">{loadError.message} <button type="button" onClick={() => setRevision((value) => value + 1)}>Retry</button></p>}
    {notice && <p className="bt-crud-feedback" role="status">{notice}</p>}
    {loading && <p role="status">Loading authorized tasks…</p>}
    {displayed && <DndContext id="buildtrack-kanban" sensors={sensors} collisionDetection={detectCollision}
      onDragStart={({ active }) => setActiveId(String(active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={endDrag}>
      <div className="bt-kanban-grid" aria-busy={loading || !!pending}>
        {boardStatuses.map((status) => {
          const base = displayed[status];
          const items = base.items;
          return <Column key={status} status={status} page={base} dropAllowed={validTargets.includes(status)}
            disabled={!ready || !!pending} onPage={(page) => changePage(status, page)}>
            {items.length ? items.map((task) => <TaskCard key={task.id} task={task} disabled={!ready || !!pending}
              pending={pending?.task.id === task.id} onMove={(task, target) => { if (!activeId) void move(task, target); }} />) : <p className="bt-kanban-empty">No tasks on this page.</p>}
          </Column>;
        })}
      </div>
    </DndContext>}
  </div>;
}
