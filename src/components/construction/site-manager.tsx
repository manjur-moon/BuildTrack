"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ListControls, ListPagination } from "./list-controls";
import { api, jsonRequest, type Page, type Project, type Site } from "./api";

const blank = { projectId: "", name: "", location: "", status: "PLANNED" };
type Form = typeof blank;
const siteStatuses = ["PLANNED", "ACTIVE", "ON_HOLD", "CLOSED"];

export function SiteManager() {
  const [loadFailure, setLoadFailure] = useState<{ key: string; message: string } | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; result: Page<Site> } | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectDirectory, setProjectDirectory] = useState<Record<string, Project>>({});
  const [projectSearch, setProjectSearch] = useState("");
  const router = useRouter();
  const params = useSearchParams();
  const query = params.toString();
  const listUrl = `/api/v1/sites${query ? `?${query}` : ""}`;
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
    api<Page<Site>>(listUrl, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setLoaded({ key: `${listUrl}:${revision}`, result }); setLoadFailure(null); setError(""); } })
      .catch((reason: unknown) => { if (!controller.signal.aborted) { setLoadFailure({ key: `${listUrl}:${revision}`, message: reason instanceof Error ? reason.message : "Unable to load sites." }); setError(reason instanceof Error ? reason.message : "Unable to load sites."); } });
    return () => controller.abort();
  }, [listUrl, revision]);
  const data = loaded?.key === `${listUrl}:${revision}` ? loaded.result : null;
  const loading = data === null && loadFailure?.key !== `${listUrl}:${revision}`;

  // The project create picker queries the server, not just an initial 100-project array.
  // Selected projects remain cached as the lookup term changes.
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const q = projectSearch.trim();
      const url = `/api/v1/projects?page=1&limit=100${q ? `&q=${encodeURIComponent(q)}` : ""}`;
      api<Page<Project>>(url, { signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return;
          const editable = result.items.filter((project) => project.canEdit && project.visibility === "full");
          setProjects(editable);
          setProjectDirectory((old) => {
            const next = { ...old };
            for (const project of editable) next[project.id] = project;
            return next;
          });
        })
        .catch(() => { /* Independent site listings must work even if the create picker fails. */ });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [projectSearch, revision]);
  const selectedProject = projectDirectory[form.projectId];
  const projectOptions = selectedProject && !projects.some((project) => project.id === selectedProject.id)
    ? [selectedProject, ...projects] : projects;

  function openCreate() { setEditing(null); setForm({ ...blank, projectId: projects[0]?.id ?? "" }); setProjectSearch(""); setDraftKey(crypto.randomUUID()); setFormOpen(true); setError(""); }
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
        setNotice("Construction site created successfully."); router.replace("/dashboard/sites", { scroll: false });
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

  return <div className="bt-crud">
    <div className="bt-crud-heading"><div><p className="bt-section-kicker">OPERATIONS / SITES</p><h1>Construction sites</h1><p>Scoped site access, operational status and immutable audit history.</p></div>
      {projects.length > 0 && <button className="bt-crud-primary" type="button" onClick={openCreate}>+ New site</button>}
    </div>
    {error && <div role="alert" className="bt-crud-feedback">{error}</div>}
    {notice && <div role="status" className="bt-crud-feedback">{notice}</div>}
    {formOpen && <section className="bt-crud-editor" aria-label={editing ? "Edit site" : "Create site"}>
      <div className="bt-crud-form-head"><h2>{editing ? "Edit construction site" : "Create construction site"}</h2><button type="button" onClick={() => setFormOpen(false)}>Close</button></div>
      <form onSubmit={(event) => void submit(event)} className="bt-crud-form">
        {!editing && <>
          <label>Find project<input type="search" placeholder="Search project name or code" value={projectSearch} maxLength={100}
            onChange={(event) => setProjectSearch(event.target.value)}/></label>
          <label>Project<select required value={form.projectId} onChange={(event) => change("projectId", event.target.value)}>
            <option value="">Select an authorized project</option>
            {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name} ({project.code})</option>)}
          </select></label>
        </>}
        {(!editing || editing.canEditDetails) && <><label>Site name<input required minLength={2} maxLength={140} value={form.name} onChange={(event) => change("name", event.target.value)}/></label>
        <label>Location<input required minLength={2} maxLength={240} value={form.location} onChange={(event) => change("location", event.target.value)}/></label></>}
        {editing && <label>Status<select value={form.status} onChange={(event) => change("status", event.target.value)}>{siteStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>}
        <div className="bt-crud-form-actions"><button type="button" onClick={() => setFormOpen(false)}>Cancel</button><button className="bt-crud-primary" type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save site" : "Create site"}</button></div>
      </form>
    </section>}
    <ListControls mode="site" projects={projects}/>
    <div className="bt-crud-panel"><div className="bt-crud-panel-head"><h2>Site register</h2><span>{data ? `${data.total} records` : "Loading"}</span></div>
      {loading ? <p className="bt-crud-empty">Loading authorized sites…</p> : !data?.items.length ? <p className="bt-crud-empty">{query ? "No sites match these filters. Adjust or reset your search." : "No sites visible. Create a site from an authorized project or request a site assignment."}</p> :
        <div className="bt-crud-table-wrap"><table className="bt-crud-table"><thead><tr><th scope="col">Site</th><th scope="col">Project</th><th scope="col">Location</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead><tbody>
          {data.items.map((site) => <tr key={site.id}><td><strong>{site.name}</strong></td><td><span className="bt-crud-code">{projects.find((project) => project.id === site.projectId)?.code ?? "Assigned project"}</span></td><td>{site.location}</td><td><span className="bt-crud-tag">{site.status.replaceAll("_", " ")}</span></td>
            <td><div className="bt-crud-actions">{site.canEdit && <button type="button" onClick={() => openEdit(site)}>Edit</button>}{site.canArchive && <button type="button" onClick={() => void archive(site)}>Archive</button>}</div></td></tr>)}
        </tbody></table></div>}
      {data && <ListPagination page={data.page} limit={data.limit} total={data.total} totalPages={data.totalPages}/>}
    </div>
  </div>;
}
