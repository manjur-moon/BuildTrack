"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api, jsonRequest, type Page, type Project, type Site } from "./api";
import { TaskDependencies } from "./task-dependencies";
import { ListPagination } from "./list-controls";

type Task = {
  id: string; projectId: string; projectName: string; projectCode: string;
  siteId: string | null; siteName: string | null;
  title: string; description: string | null; priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "TODO" | "IN_PROGRESS" | "REVIEW" | "COMPLETED";
  blocked: boolean;
  progressPercent: number; startsOn: string | null; dueOn: string;
  completedAt: string | null; createdAt: string; updatedAt: string;
  assignees: { id: string; name: string }[];
  canEdit: boolean; canAssign: boolean; canArchive: boolean; canReportProgress: boolean; canApprove: boolean;
};
type TaskSummary = { total: number; overdue: number; averageProgress: number;
  counts: { TODO: number; IN_PROGRESS: number; REVIEW: number; COMPLETED: number } };
type Candidate = { id: string; name: string };
type HistoryItem = { fromStatus: string; toStatus: string; note: string | null; by: string; changedAt: string };
const statuses = ["TODO", "IN_PROGRESS", "REVIEW", "COMPLETED"] as const;
const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const transitions: Record<Task["status"], Task["status"][]> = {
  TODO: ["TODO", "IN_PROGRESS"],
  IN_PROGRESS: ["IN_PROGRESS", "TODO", "REVIEW"],
  REVIEW: ["REVIEW", "IN_PROGRESS", "COMPLETED"],
  COMPLETED: [],
};
const newTask = { title: "", description: "", projectId: "", siteId: "", startsOn: "", dueOn: "", priority: "MEDIUM" };
type Draft = typeof newTask;
const nice = (value: string) => value.replaceAll("_", " ");

export function TaskManager({ canCreate }: { canCreate: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const url = `/api/v1/tasks${query ? `?${query}` : ""}`;
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; result: Page<Task> } | null>(null);
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null);
  const [summary, setSummary] = useState<{ key: string; result: TaskSummary } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [draft, setDraft] = useState<Draft>(newTask);
  const [progressDraft, setProgressDraft] = useState({ status: "IN_PROGRESS", progressPercent: "0", note: "" });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [newAssignee, setNewAssignee] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const key = `${url}:${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    api<Page<Task>>(url, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) { setLoaded({ key, result }); setLoadError(null); }
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setLoadError({ key, message: reason instanceof Error ? reason.message : "Unable to load tasks." });
    });
    return () => controller.abort();
  }, [url, revision, key]);
  useEffect(() => {
    const controller = new AbortController();
    api<TaskSummary>(`/api/v1/tasks/summary${query ? `?${query}` : ""}`, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setSummary({ key, result });
    }).catch(() => { /* The task list displays actionable errors independently. */ });
    return () => controller.abort();
  }, [key, query]);
  const data = loaded?.key === key ? loaded.result : null;
  const loading = !data && loadError?.key !== key;
  const selected = useMemo(() => data?.items.find((item) => item.id === selectedId) ?? null, [data, selectedId]);

  const getPickers = useCallback(async (q: string) => {
    const s = new URLSearchParams({ limit: "100" });
    if (q.trim()) s.set("q", q.trim());
    const [p, t] = await Promise.allSettled([
      api<Page<Project>>(`/api/v1/projects?${s}`),
      api<Page<Site>>(`/api/v1/sites?${s}`),
    ]);
    if (p.status === "fulfilled") setProjects(p.value.items);
    if (t.status === "fulfilled") setSites(t.value.items);
  }, []);
  useEffect(() => {
  const controller = new AbortController();
  const search = new URLSearchParams({ limit: "100" });

  Promise.allSettled([
    api<Page<Project>>(`/api/v1/projects?${search}`, {
      signal: controller.signal,
    }),
    api<Page<Site>>(`/api/v1/sites?${search}`, {
      signal: controller.signal,
    }),
  ]).then(([projectResult, siteResult]) => {
    if (controller.signal.aborted) return;

    if (projectResult.status === "fulfilled") {
      setProjects(projectResult.value.items);
    }

    if (siteResult.status === "fulfilled") {
      setSites(siteResult.value.items);
    }
  });

  return () => controller.abort();
}, []);

  async function openTask(item: Task) {
    setSelectedId(item.id); setHistory([]); setCandidates([]); setNewAssignee(""); setError("");
    setProgressDraft({ status: item.status, progressPercent: String(item.progressPercent), note: "" });
    setHistoryLoading(true);
    const h = api<{ items: HistoryItem[] }>(`/api/v1/tasks/${encodeURIComponent(item.id)}/history`);
    const c = item.canAssign
      ? api<{ candidates: Candidate[] }>(`/api/v1/tasks/${encodeURIComponent(item.id)}/assignees`)
      : Promise.resolve({ candidates: [] as Candidate[] });
    const [hs, cs] = await Promise.allSettled([h, c]);
    if (hs.status === "fulfilled") setHistory(hs.value.items);
    if (cs.status === "fulfilled") setCandidates(cs.value.candidates);
    setHistoryLoading(false);
  }

  function openCreate() {
    setEditing(null); setDraft(newTask); setFormOpen(true); setSelectedId(null); setError(""); setNotice("");
  }
  function openEdit(task: Task) {
    setEditing(task);
    setDraft({ title: task.title, description: task.description ?? "", priority: task.priority,
      projectId: task.projectId, siteId: task.siteId ?? "", startsOn: task.startsOn ?? "", dueOn: task.dueOn });
    setFormOpen(true); setError(""); setNotice("");
  }
  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const site = sites.find((candidate) => candidate.id === draft.siteId);
    const projectId = draft.projectId || site?.projectId || "";
    if (!projectId) { setError("Choose a project or an authorized site."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const input = { title: draft.title, description: draft.description || null,
        priority: draft.priority, startsOn: draft.startsOn || null, dueOn: draft.dueOn };
      if (editing) {
        await api<Task>(`/api/v1/tasks/${encodeURIComponent(editing.id)}`,
          jsonRequest("PATCH", { ...input, expectedUpdatedAt: editing.updatedAt }));
        setNotice("Task details saved.");
      } else {
        const data = { ...input, projectId, siteId: draft.siteId || null };
        await api<Task>("/api/v1/tasks", jsonRequest("POST", data, crypto.randomUUID()));
        setNotice("New construction task created.");
      }
      setFormOpen(false); refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save task."); }
    finally { setBusy(false); }
  }
  async function updateProgress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const updated = await api<Task>(`/api/v1/tasks/${encodeURIComponent(selected.id)}/status`, jsonRequest("PATCH", {
        status: progressDraft.status, progressPercent: Number(progressDraft.progressPercent),
        note: progressDraft.note, expectedUpdatedAt: selected.updatedAt,
      }));
      setProgressDraft({ status: updated.status, progressPercent: String(updated.progressPercent), note: "" });
      setNotice("Progress recorded and audit history updated."); refresh();
      const updatedHistory = await api<{ items: HistoryItem[] }>(`/api/v1/tasks/${encodeURIComponent(selected.id)}/history`);
      setHistory(updatedHistory.items);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update progress."); }
    finally { setBusy(false); }
  }
  async function changeAssignee(membershipId: string, remove = false) {
    if (!selected || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const id = encodeURIComponent(selected.id);
      if (remove) await api<Task>(`/api/v1/tasks/${id}/assignees/${encodeURIComponent(membershipId)}`,
        { method: "DELETE" });
      else await api<Task>(`/api/v1/tasks/${id}/assignees`, jsonRequest("POST", { membershipId }));
      setNewAssignee(""); setNotice(remove ? "Assignee removed." : "Assignee added."); refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to change assignment."); }
    finally { setBusy(false); }
  }
  async function archive(task: Task) {
    const reason = window.prompt("Archive reason (minimum 10 characters):");
    if (reason === null) return;
    if (reason.trim().length < 10) { setError("A minimum 10-character reason is required."); return; }
    if (!window.confirm(`Archive task \"${task.title}\"? This preserves its audit history.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api<{ archived: true }>(`/api/v1/tasks/${encodeURIComponent(task.id)}/archive`,
        jsonRequest("POST", { expectedUpdatedAt: task.updatedAt, reason }));
      setSelectedId(null); setNotice("Task archived. Audit history retained."); refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to archive task."); }
    finally { setBusy(false); }
  }
  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const p = new URLSearchParams();
    for (const name of ["q", "status", "priority", "projectId", "siteId", "from", "to", "mine", "sortBy", "order", "limit"]) {
      const v = values.get(name);
      if (typeof v === "string" && v.trim() !== "") p.set(name, v.trim());
    }
    p.set("page", "1"); router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    setSelectedId(null);
  }
  const projectChoices = useMemo(() => {
    const names = new Map(projects.map((project) => [project.id, `${project.name} · ${project.code}`]));
    for (const site of sites) if (!names.has(site.projectId)) names.set(site.projectId, `Site project · ${site.projectId.slice(0, 12)}`);
    return [...names].map(([id, label]) => ({ id, label }));
  }, [projects, sites]);
  const visibleSites = sites.filter((s) => !draft.projectId || s.projectId === draft.projectId);
  const currentProject = projects.some((p) => p.id === draft.projectId);
  const allowedProgressStatuses = selected
    ? transitions[selected.status].filter((s) => s !== "COMPLETED" || selected.canApprove)
    : [];

  return <div className="bt-crud bt-task-page">
    <header className="bt-crud-heading">
      <div><p className="bt-section-kicker">BUILDTRACK / OPERATIONS</p>
        <h1>Task Workboard<span className="bt-module-dot">.</span></h1>
        <p>Coordinate site work, record measurable progress and approve completion.</p></div>
      {canCreate && <button type="button" className="bt-crud-primary" onClick={openCreate}>+ Create task</button>}
    </header>
    {notice && <p className="bt-crud-feedback" role="status">{notice}</p>}
    {error && <p className="bt-crud-feedback" role="alert">{error}</p>}
    {loadError?.key === key && <p className="bt-crud-feedback" role="alert">{loadError.message} <button type="button" onClick={refresh}>Retry</button></p>}

    {summary?.key === key && <div className="bt-task-summary" aria-label="Authorized task summary">
      <div><small>Authorized tasks</small><strong>{summary.result.total}</strong></div>
      <div><small>In progress</small><strong>{summary.result.counts.IN_PROGRESS}</strong></div>
      <div><small>Awaiting review</small><strong>{summary.result.counts.REVIEW}</strong></div>
      <div><small>Overdue</small><strong>{summary.result.overdue}</strong></div>
      <div><small>Average progress</small><strong>{Math.round(summary.result.averageProgress)}%</strong></div>
    </div>}
    <form key={query} className="bt-list-controls bt-task-filters" onSubmit={applyFilters} role="search">
      <label className="bt-list-search">Search
        <input type="search" name="q" maxLength={100} defaultValue={params.get("q") ?? ""} placeholder="Task title or description" />
      </label>
      <label>Status<select name="status" defaultValue={params.get("status") ?? ""}>
        <option value="">All statuses</option>{statuses.map((s) => <option key={s} value={s}>{nice(s)}</option>)}
      </select></label>
      <label>Priority<select name="priority" defaultValue={params.get("priority") ?? ""}>
        <option value="">All priorities</option>{priorities.map((s) => <option key={s} value={s}>{s}</option>)}
      </select></label>
      <label>Project<select name="projectId" defaultValue={params.get("projectId") ?? ""}>
        <option value="">All authorized projects</option>
        {params.get("projectId") && !projectChoices.some((p) => p.id === params.get("projectId")) &&
          <option value={params.get("projectId") ?? ""}>Current project</option>}
        {projectChoices.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}
      </select></label>
      <label>Site<select name="siteId" defaultValue={params.get("siteId") ?? ""}>
        <option value="">All authorized sites</option>
        {params.get("siteId") && !sites.some((s) => s.id === params.get("siteId")) &&
          <option value={params.get("siteId") ?? ""}>Current site</option>}
        {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
      </select></label>
      <label>Due from<input type="date" name="from" defaultValue={params.get("from") ?? ""} /></label>
      <label>Due to<input type="date" name="to" defaultValue={params.get("to") ?? ""} /></label>
      <label>Sort by<select name="sortBy" defaultValue={params.get("sortBy") ?? "dueOn"}>
        <option value="dueOn">Due date</option><option value="createdAt">Created</option>
        <option value="priority">Priority</option><option value="status">Status</option><option value="title">Task title</option>
      </select></label>
      <label>Order<select name="order" defaultValue={params.get("order") ?? "asc"}>
        <option value="asc">Ascending</option><option value="desc">Descending</option>
      </select></label>
      <label>Assignment<select name="mine" defaultValue={params.get("mine") ?? "false"}>
        <option value="false">All authorized work</option><option value="true">Assigned to me</option>
      </select></label>
      <label>Page size<select name="limit" defaultValue={params.get("limit") ?? "20"}>
        {[10,20,50,100].map((n) => <option key={n} value={n}>{n}</option>)}
      </select></label>
      <div className="bt-list-control-actions"><button className="bt-crud-primary" type="submit">Apply filters</button>
        <button type="button" onClick={() => router.replace(pathname, { scroll: false })}>Reset</button></div>
    </form>

    {formOpen && <section className="bt-crud-editor" aria-label={editing ? "Edit task" : "Create task"}>
      <div className="bt-crud-form-head"><h2>{editing ? "Edit task details" : "Create construction task"}</h2>
        <button type="button" onClick={() => setFormOpen(false)}>Close</button></div>
      <form className="bt-crud-form" onSubmit={(event) => void saveTask(event)}>
        <label>Task title<input required minLength={3} maxLength={160} value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}/></label>
        <label>Priority<select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}>
          {priorities.map((p) => <option key={p}>{p}</option>)}</select></label>
        {!editing && <>
          <label>Project<select value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value, siteId: "" })}>
            <option value="">Choose a project or choose a site below</option>
            {draft.projectId && !currentProject && <option value={draft.projectId}>Current project</option>}
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.code}</option>)}
          </select></label>
          <label>Site<select value={draft.siteId} onChange={(event) => {
            const site = sites.find((s) => s.id === event.target.value);
            setDraft({ ...draft, siteId: event.target.value, projectId: site?.projectId ?? draft.projectId });
          }}><option value="">Project-level task</option>
            {visibleSites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
          </select></label>
          <div className="bt-crud-span bt-task-picker"><label>Find project/site
            <input type="search" maxLength={100} value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Search accessible projects or sites"/></label>
            <button type="button" onClick={() => void getPickers(pickerSearch)}>Search resources</button></div>
        </>}
        <label>Start date (optional)<input type="date" value={draft.startsOn}
          onChange={(event) => setDraft({ ...draft, startsOn: event.target.value })}/></label>
        <label>Due date<input type="date" required value={draft.dueOn}
          onChange={(event) => setDraft({ ...draft, dueOn: event.target.value })}/></label>
        <label className="bt-crud-span">Description<textarea rows={3} maxLength={3000} value={draft.description}
          onChange={(event) => setDraft({ ...draft, description: event.target.value })}/></label>
        <div className="bt-crud-form-actions"><button type="button" onClick={() => setFormOpen(false)}>Cancel</button>
          <button className="bt-crud-primary" disabled={busy} type="submit">{busy ? "Saving…" : editing ? "Save changes" : "Create task"}</button></div>
      </form>
    </section>}

    <section className="bt-crud-panel" aria-label="Task list">
      <div className="bt-crud-panel-head"><h2>Construction tasks</h2><span>{data ? `${data.total} authorized result(s)` : "Loading"}</span></div>
      {loading && <p className="bt-crud-empty" role="status">Loading authorized tasks…</p>}
      {data && data.items.length === 0 && <p className="bt-crud-empty">No tasks match this filter. Create a task or adjust the search.</p>}
      {data && data.items.length > 0 && <div className="bt-crud-table-wrap"><table className="bt-crud-table bt-task-table">
        <thead><tr><th>Task</th><th>Project / Site</th><th>Priority</th><th>Status</th><th>Progress</th><th>Due</th><th>Action</th></tr></thead>
        <tbody>{data.items.map((task) => <tr key={task.id}>
          <td><strong>{task.title}</strong><small>{task.assignees.map((a) => a.name).join(", ") || "Unassigned"}</small></td>
          <td><strong>{task.projectCode}</strong><small>{task.siteName ?? "Project-level work"}</small></td>
          <td><span className="bt-crud-tag">{task.priority}</span></td>
          <td><span className="bt-crud-tag">{nice(task.status)}</span>{task.blocked && <small>Blocked</small>}</td>
          <td><div className="bt-task-progress"><span style={{ width: `${task.progressPercent}%` }} /></div><small>{task.progressPercent}%</small></td>
          <td>{task.dueOn}</td>
          <td><button className="bt-task-plain" type="button" onClick={() => void openTask(task)}>Manage</button></td>
        </tr>)}</tbody></table></div>}
      {data && <ListPagination page={data.page} limit={data.limit} total={data.total} totalPages={data.totalPages}/>} 
    </section>

    {selected && <section className="bt-crud-panel bt-task-detail" aria-label="Task details">
      <div className="bt-crud-panel-head"><div><h2>{selected.title}</h2><span>{selected.projectName} · {selected.siteName ?? "Project work"}</span></div>
        <button className="bt-task-plain" type="button" onClick={() => setSelectedId(null)}>Close</button></div>
      <div className="bt-task-detail-body">
        <div className="bt-task-detail-main">
          <dl className="bt-task-facts"><div><dt>Status</dt><dd>{nice(selected.status)}</dd></div>
            <div><dt>Progress</dt><dd>{selected.progressPercent}%</dd></div>
            <div><dt>Priority</dt><dd>{selected.priority}</dd></div>
            <div><dt>Due date</dt><dd>{selected.dueOn}</dd></div></dl>
          {selected.blocked && <p role="status">Blocked: complete all prerequisites before progressing.</p>}
          {selected.canEdit && <TaskDependencies key={selected.id} taskId={selected.id} editable={selected.status !== "COMPLETED"} onChange={refresh}/>}
          {selected.description && <p className="bt-task-description">{selected.description}</p>}
          <div className="bt-task-inline-actions">
            {selected.canEdit && selected.status !== "COMPLETED" && <button type="button" onClick={() => openEdit(selected)}>Edit details</button>}
            {selected.canArchive && <button type="button" onClick={() => void archive(selected)}>Archive task</button>}
          </div>
          {selected.canReportProgress && <form className="bt-task-progress-form" onSubmit={(event) => void updateProgress(event)}>
            <h3>Report progress</h3>
            <div className="bt-task-fields"><label>Next status<select value={progressDraft.status} onChange={(event) => {
              const status = event.target.value;
              setProgressDraft({ ...progressDraft, status,
                progressPercent: status === "COMPLETED" ? "100" : status === "TODO" ? "0" : progressDraft.progressPercent });
            }}>{allowedProgressStatuses.map((s) => <option key={s} value={s}>{nice(s)}</option>)}</select></label>
            <label>Progress (%)<input type="number" min={0} max={100} step={0.01} required value={progressDraft.progressPercent}
              onChange={(event) => setProgressDraft({ ...progressDraft, progressPercent: event.target.value })}/></label></div>
            <label>Progress note (optional)<textarea rows={2} maxLength={500} value={progressDraft.note}
              onChange={(event) => setProgressDraft({ ...progressDraft, note: event.target.value })}/></label>
            <button disabled={busy} className="bt-crud-primary" type="submit">{busy ? "Saving…" : "Save progress"}</button>
            {selected.status === "REVIEW" && !selected.canApprove && <p>Completion requires approval by the Project Manager or Admin.</p>}
          </form>}
        </div>
        <div className="bt-task-detail-side"><h3>Assigned team</h3>
          {selected.assignees.length === 0 && <p>No assignees yet.</p>}
          {selected.assignees.map((a) => <div className="bt-task-assignee" key={a.id}><span>{a.name}</span>
            {selected.canAssign && <button type="button" disabled={busy} onClick={() => void changeAssignee(a.id, true)}>Remove</button>}</div>)}
          {selected.canAssign && <div className="bt-task-add"><label>Assign enrolled member<select value={newAssignee} onChange={(event) => setNewAssignee(event.target.value)}>
            <option value="">Select a member</option>{candidates.filter((c) => !selected.assignees.some((a) => a.id === c.id)).map((c) =>
              <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <button type="button" disabled={!newAssignee || busy} onClick={() => void changeAssignee(newAssignee)}>Assign member</button></div>}
          <h3>Progress timeline</h3>
          {historyLoading && <p>Loading history…</p>}
          {!historyLoading && !history.length && <p>No status transitions recorded yet.</p>}
          <ol className="bt-task-history">{history.map((entry, i) => <li key={`${entry.changedAt}:${i}`}>
            <strong>{nice(entry.fromStatus)} → {nice(entry.toStatus)}</strong><small>{entry.by} · {new Date(entry.changedAt).toLocaleString()}</small>
            {entry.note && <p>{entry.note}</p>}</li>)}</ol>
        </div>
      </div>
    </section>}
  </div>;
}
