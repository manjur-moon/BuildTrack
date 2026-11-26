"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, jsonRequest, type Page, type Project, type Site } from "./api";

const blank = { projectId: "", name: "", location: "", status: "PLANNED" };
type Form = typeof blank;
const siteStatuses = ["PLANNED", "ACTIVE", "ON_HOLD", "CLOSED"];

export function SiteManager() {
  const [data, setData] = useState<Page<Site> | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Site | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [draftKey, setDraftKey] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    api<Page<Site>>(`/api/v1/sites?page=${page}&limit=20`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setData(result); setError(""); setLoading(false); } })
      .catch((reason: unknown) => { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "Unable to load sites."); setLoading(false); } });
    return () => controller.abort();
  }, [page, revision]);

  useEffect(() => {
    const controller = new AbortController();
    api<Page<Project>>( "/api/v1/projects?page=1&limit=100", { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setProjects(result.items.filter((project) => project.canEdit && project.visibility === "full")); })
      .catch(() => { /* This is an optional create picker; independent site reads still work. */ });
    return () => controller.abort();
  }, [revision]);

  function openCreate() { setEditing(null); setForm({ ...blank, projectId: projects[0]?.id ?? "" }); setDraftKey(crypto.randomUUID()); setFormOpen(true); setError(""); }
  function openEdit(site: Site) { setEditing(site); setForm({ projectId: site.projectId, name: site.name,
    location: site.location, status: site.status }); setFormOpen(true); setError(""); }
  function change(field: keyof Form, value: string) { setForm((old) => ({ ...old, [field]: value })); setDraftKey(crypto.randomUUID()); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      if (editing) {
        await api(`/api/v1/sites/${editing.id}`, jsonRequest("PATCH", {
          expectedUpdatedAt: editing.updatedAt, status: form.status,
          ...(editing.canEditDetails ? { name: form.name, location: form.location } : {}),
        }));
        setNotice("Site updated successfully.");
      } else {
        await api("/api/v1/sites", jsonRequest("POST", {
          projectId: form.projectId, name: form.name, location: form.location,
        }, draftKey));
        setNotice("Construction site created successfully."); setPage(1);
      }
      setFormOpen(false); setEditing(null); refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to save site."); }
    finally { setSaving(false); }
  }
  async function archive(site: Site) {
    if (!window.confirm(`Archive site ${site.name}? Active tasks must be completed or reassigned first.`)) return;
    setError(""); setNotice("");
    try {
      await api(`/api/v1/sites/${site.id}/archive`, jsonRequest("POST", { expectedUpdatedAt: site.updatedAt }));
      setNotice("Site archived. Historical records were retained."); refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to archive site."); }
  }
  function paginate(next: number) { setPage(next); setLoading(true); setFormOpen(false); }

  return <div className="bt-crud">
    <div className="bt-crud-heading"><div><p className="bt-section-kicker">OPERATIONS / SITES</p><h1>Construction sites</h1><p>Scoped site access, operational status and immutable audit history.</p></div>
      {projects.length > 0 && <button className="bt-crud-primary" type="button" onClick={openCreate}>+ New site</button>}
    </div>
    {error && <div role="alert" className="bt-crud-feedback">{error}</div>}
    {notice && <div role="status" className="bt-crud-feedback">{notice}</div>}
    {formOpen && <section className="bt-crud-editor" aria-label={editing ? "Edit site" : "Create site"}>
      <div className="bt-crud-form-head"><h2>{editing ? "Edit construction site" : "Create construction site"}</h2><button type="button" onClick={() => setFormOpen(false)}>Close</button></div>
      <form onSubmit={(event) => void submit(event)} className="bt-crud-form">
        {!editing && <label>Project<select required value={form.projectId} onChange={(event) => change("projectId", event.target.value)}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} ({project.code})</option>)}</select></label>}
        {(!editing || editing.canEditDetails) && <><label>Site name<input required minLength={2} maxLength={140} value={form.name} onChange={(event) => change("name", event.target.value)}/></label>
        <label>Location<input required minLength={2} maxLength={240} value={form.location} onChange={(event) => change("location", event.target.value)}/></label></>}
        {editing && <label>Status<select value={form.status} onChange={(event) => change("status", event.target.value)}>{siteStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>}
        <div className="bt-crud-form-actions"><button type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="bt-crud-primary" type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save site" : "Create site"}</button></div>
      </form>
    </section>}
    <div className="bt-crud-panel"><div className="bt-crud-panel-head"><h2>Site register</h2><span>{data ? `${data.total} records` : "Loading"}</span></div>
      {loading ? <p className="bt-crud-empty">Loading authorized sites…</p> : !data?.items.length ? <p className="bt-crud-empty">No sites visible. Create a site from an authorized project or request a site assignment.</p> :
        <div className="bt-crud-table-wrap"><table className="bt-crud-table"><thead><tr><th scope="col">Site</th><th scope="col">Project</th><th scope="col">Location</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>
          {data.items.map((site) => <tr key={site.id}><td><strong>{site.name}</strong></td><td><span className="bt-crud-code">{projects.find((project) => project.id === site.projectId)?.code ?? "Assigned project"}</span></td><td>{site.location}</td><td><span className="bt-crud-tag">{site.status.replaceAll("_", " ")}</span></td>
            <td><div className="bt-crud-actions">{site.canEdit && <button type="button" onClick={() => openEdit(site)}>Edit</button>}{site.canArchive && <button type="button" onClick={() => void archive(site)}>Archive</button>}</div></td></tr>)}
        </tbody></table></div>}
      {data && data.total > data.limit && <div className="bt-crud-pagination"><button type="button" disabled={page <= 1 || loading} onClick={() => paginate(page - 1)}>Previous</button><span>Page {page} of {Math.ceil(data.total / data.limit)}</span><button type="button" disabled={page * data.limit >= data.total || loading} onClick={() => paginate(page + 1)}>Next</button></div>}
    </div>
  </div>;
}
