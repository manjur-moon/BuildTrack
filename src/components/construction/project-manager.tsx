"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ListControls, ListPagination } from "./list-controls";
import Link from "next/link";
import { api, jsonRequest, type Page, type Project } from "./api";

const emptyForm = { name: "", code: "", description: "", location: "", startDate: "", expectedEndDate: "", actualEndDate: "", status: "PLANNED" };
type Form = typeof emptyForm;
const projectStatuses = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];

export function ProjectManager() {
  const [loadFailure, setLoadFailure] = useState<{ key: string; message: string } | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; result: Page<Project> } | null>(null);
  const router = useRouter();
  const params = useSearchParams();
  const query = params.toString();
  const listUrl = `/api/v1/projects${query ? `?${query}` : ""}`;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [draftKey, setDraftKey] = useState("");
  const [revision, setRevision] = useState(0);

  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    api<Page<Project>>(listUrl, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setLoaded({ key: `${listUrl}:${revision}`, result }); setLoadFailure(null); setError(""); } })
      .catch((reason: unknown) => { if (!controller.signal.aborted) { setLoadFailure({ key: `${listUrl}:${revision}`, message: reason instanceof Error ? reason.message : "Unable to load projects." }); setError(reason instanceof Error ? reason.message : "Unable to load projects."); } });
    return () => controller.abort();
  }, [listUrl, revision]);
  const data = loaded?.key === `${listUrl}:${revision}` ? loaded.result : null;
  const loading = data === null && loadFailure?.key !== `${listUrl}:${revision}`;

  function openCreate() { setEditing(null); setForm(emptyForm); setDraftKey(crypto.randomUUID()); setFormOpen(true); setError(""); }
  function openEdit(project: Project) {
    if (project.visibility !== "full" || !project.updatedAt) return;
    setEditing(project);
    setForm({ name: project.name, code: project.code, description: project.description ?? "",
      location: project.location ?? "", startDate: project.startDate ?? "",
      expectedEndDate: project.expectedEndDate ?? "", actualEndDate: project.actualEndDate ?? "", status: project.status });
    setFormOpen(true); setError("");
  }
  function change(field: keyof Form, value: string) {
    setForm((old) => ({ ...old, [field]: value }));
    setDraftKey(crypto.randomUUID());
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      if (editing) {
        await api(`/api/v1/projects/${editing.id}`, jsonRequest("PATCH", {
          expectedUpdatedAt: editing.updatedAt,
          name: form.name, description: form.description || null, location: form.location,
          startDate: form.startDate, expectedEndDate: form.expectedEndDate,
          status: form.status, actualEndDate: form.actualEndDate || null,
        }));
        setNotice("Project updated successfully.");
      } else {
        await api("/api/v1/projects", jsonRequest("POST", {
          name: form.name, code: form.code, description: form.description || null,
          location: form.location, startDate: form.startDate, expectedEndDate: form.expectedEndDate,
        }, draftKey));
        setNotice("Project created successfully.");
        router.replace("/dashboard/projects", { scroll: false });
      }
      setFormOpen(false); setEditing(null); refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save project."); }
    finally { setSaving(false); }
  }
  async function archive(project: Project) {
    if (!project.updatedAt || !window.confirm(`Archive ${project.name}? This hides the project from active workflows.`)) return;
    setError(""); setNotice("");
    try {
      await api(`/api/v1/projects/${project.id}/archive`, jsonRequest("POST", { expectedUpdatedAt: project.updatedAt }));
      setNotice("Project archived. Existing records were retained."); refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to archive project."); }
  }

  return <div className="bt-crud">
    <div className="bt-crud-heading"><div><p className="bt-section-kicker">PORTFOLIO / PROJECTS</p><h1>Construction projects</h1><p>Organization-scoped projects with live operational permissions.</p></div>
      {data?.canCreate && <button className="bt-crud-primary" type="button" onClick={openCreate}>+ New project</button>}
    </div>
    {error && <div role="alert" className="bt-crud-feedback">{error}</div>}
    {notice && <div role="status" className="bt-crud-feedback">{notice}</div>}
    {formOpen && <section className="bt-crud-editor" aria-label={editing ? "Edit project" : "Create project"}>
      <div className="bt-crud-form-head"><h2>{editing ? "Edit project" : "Create project"}</h2><button type="button" onClick={() => setFormOpen(false)}>Close</button></div>
      <form onSubmit={(event) => void submit(event)} className="bt-crud-form">
        <label>Project name<input required minLength={2} maxLength={140} value={form.name} onChange={(event) => change("name", event.target.value)}/></label>
        {!editing && <label>Unique code<input required minLength={2} maxLength={24} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,23}" value={form.code} onChange={(event) => change("code", event.target.value)} placeholder="BT-001"/></label>}
        <label>Location<input required maxLength={240} value={form.location} onChange={(event) => change("location", event.target.value)}/></label>
        <label>Start date<input required type="date" value={form.startDate} onChange={(event) => change("startDate", event.target.value)}/></label>
        <label>Expected end date<input required type="date" min={form.startDate} value={form.expectedEndDate} onChange={(event) => change("expectedEndDate", event.target.value)}/></label>
        {editing && <><label>Status<select value={form.status} onChange={(event) => change("status", event.target.value)}>{projectStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
          <label>Actual end date<input type="date" min={form.startDate} value={form.actualEndDate} onChange={(event) => change("actualEndDate", event.target.value)}/></label></>}
        <label className="bt-crud-span">Description (optional)<textarea rows={3} maxLength={3000} value={form.description} onChange={(event) => change("description", event.target.value)}/></label>
        <div className="bt-crud-form-actions"><button type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="bt-crud-primary" disabled={saving} type="submit">{saving ? "Saving…" : editing ? "Save project" : "Create project"}</button></div>
      </form>
    </section>}
    <ListControls mode="project" privateDatesAllowed={data?.canUsePrivateProjectFilters ?? true}/>
    <div className="bt-crud-panel">
      <div className="bt-crud-panel-head"><h2>Project portfolio</h2><span>{data ? `${data.total} records` : "Loading"}</span></div>
      {loading ? <p className="bt-crud-empty">Loading authorized projects…</p> : !data?.items.length ? <p className="bt-crud-empty">{query ? "No projects match these filters. Adjust or reset your search." : "No visible projects. An owner can create one; other users need an assigned operational role."}</p> : <div className="bt-crud-table-wrap"><table className="bt-crud-table"><thead><tr><th scope="col">Project</th><th scope="col">Status</th><th scope="col">Location</th><th scope="col">Expected end</th><th scope="col">Actions</th></tr></thead>
        <tbody>{data.items.map((project) => <tr key={project.id}><td><strong>{project.name}</strong><small>{project.code} {project.visibility === "summary" ? "· Summary access" : ""}</small></td>
          <td><span className="bt-crud-tag">{project.status.replaceAll("_", " ")}</span></td><td>{project.location ?? "Restricted"}</td><td>{project.expectedEndDate ?? "Restricted"}</td>
          <td><div className="bt-crud-actions">{project.canEdit && <button type="button" onClick={() => openEdit(project)}>Edit</button>}{project.canArchive && <button type="button" onClick={() => void archive(project)}>Archive</button>}{project.visibility === "full" && <Link href={`/dashboard/sites?projectId=${encodeURIComponent(project.id)}`}>Sites</Link>}</div></td></tr>)}</tbody></table></div>}
      {data && <ListPagination page={data.page} limit={data.limit} total={data.total} totalPages={data.totalPages}/>}
    </div>
  </div>;
}
