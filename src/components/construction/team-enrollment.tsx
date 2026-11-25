"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, jsonRequest } from "./api";

type Role = "PROJECT_MANAGER" | "SITE_ENGINEER";
type Member = { id: string; name: string; email: string; organizationRole: string };
type Project = { id: string; name: string; code: string; managerMembershipId: string | null };
type Site = { id: string; projectId: string; name: string };
type Assignment = { id: string; role: Role; membershipId: string; projectId: string | null; siteId: string | null; expiresAt: string | null; expired: boolean };
type Workspace = {
  members: Member[]; projects: Project[]; sites: Site[]; assignments: Assignment[];
  truncated: Record<"members" | "projects" | "sites" | "assignments", boolean>;
};

export function TeamEnrollment() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [role, setRole] = useState<Role>("PROJECT_MANAGER");
  const [memberId, setMemberId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [siteId, setSiteId] = useState("");
  // Preserve the same key when retrying an unchanged failed submission.
  const [draftKey, setDraftKey] = useState("");

  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    api<Workspace>("/api/v1/team/enrollments", { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted) { setWorkspace(value); setError(""); setLoading(false); } })
      .catch((reason: unknown) => { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "Unable to load team."); setLoading(false); } });
    return () => controller.abort();
  }, [revision]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !memberId || (role === "PROJECT_MANAGER" ? !projectId : !siteId)) return;
    setSaving(true); setNotice(""); setError("");
    const input = role === "PROJECT_MANAGER"
      ? { role, projectId, membershipId: memberId }
      : { role, siteId, membershipId: memberId };
    const key = draftKey || crypto.randomUUID();
    setDraftKey(key);
    try {
      await api("/api/v1/team/enrollments", jsonRequest("POST", input, key));
      setNotice("Assignment created. Role access is now subject to live membership checks.");
      setMemberId(""); setDraftKey(""); refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Assignment failed."); }
    finally { setSaving(false); }
  }

  async function revoke(assignment: Assignment) {
    if (saving || !window.confirm(`Revoke ${assignment.role.replaceAll("_", " ")} access?`)) return;
    setSaving(true); setNotice(""); setError("");
    try {
      await api(`/api/v1/team/enrollments/${encodeURIComponent(assignment.id)}`, { method: "DELETE" });
      setNotice("Access revoked; historical audit records retained."); refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to revoke assignment."); }
    finally { setSaving(false); }
  }

  const memberName = (id: string) => workspace?.members.find((m) => m.id === id)?.name ?? `Member ${id.slice(0, 8)}`;
  const projectName = (id: string | null) => workspace?.projects.find((p) => p.id === id)?.name ?? "Project not in current list";
  const siteName = (id: string | null) => workspace?.sites.find((s) => s.id === id)?.name ?? "Site not in current list";
  const bounded = workspace && Object.entries(workspace.truncated).filter(([, value]) => value).map(([key]) => key);

  return <div className="bt-crud bt-team">
    <div className="bt-crud-heading"><div>
      <p className="bt-section-kicker">WORKSPACE / TEAM &amp; ACCESS</p>
      <h1>Project staffing</h1>
      <p>Owner-managed project leads and site engineers, with auditable access changes.</p>
    </div></div>
    {error && <div className="bt-crud-feedback" role="alert">{error}</div>}
    {notice && <div className="bt-crud-feedback" role="status">{notice}</div>}
    {bounded && bounded.length > 0 && <div className="bt-crud-feedback" role="note">
      Only the first records are displayed for {bounded.join(", ")}. Search and pagination will follow in Step 9; do not use this picker for large-organization onboarding.
    </div>}
    <section className="bt-crud-editor" aria-label="Add staff assignment">
      <div className="bt-crud-form-head"><h2>New operational assignment</h2></div>
      <form className="bt-crud-form" onSubmit={(event) => void submit(event)}>
        <label>Operational role<select value={role} onChange={(event) => { setRole(event.target.value as Role); setDraftKey(""); }}>
          <option value="PROJECT_MANAGER">Lead Project Manager</option>
          <option value="SITE_ENGINEER">Site Engineer</option>
        </select></label>
        <label>Verified organization member<select required value={memberId} onChange={(event) => { setMemberId(event.target.value); setDraftKey(""); }}>
          <option value="">Choose a member</option>
          {workspace?.members.filter((m) => m.organizationRole !== "owner").map((m) =>
            <option key={m.id} value={m.id}>{m.name} — {m.email}</option>)}
        </select></label>
        {role === "PROJECT_MANAGER" ? <label>Project<select required value={projectId} onChange={(event) => { setProjectId(event.target.value); setDraftKey(""); }}>
          <option value="">Choose a project</option>
          {workspace?.projects.filter((p) => !p.managerMembershipId || p.managerMembershipId === memberId).map((p) =>
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select></label> : <label>Construction site<select required value={siteId} onChange={(event) => { setSiteId(event.target.value); setDraftKey(""); }}>
          <option value="">Choose a site</option>
          {workspace?.sites.map((s) => <option key={s.id} value={s.id}>{projectName(s.projectId)} / {s.name}</option>)}
        </select></label>}
        <div className="bt-crud-form-actions"><button className="bt-crud-primary" disabled={!workspace || loading || saving} type="submit">
          {saving ? "Working…" : "Assign role"}
        </button></div>
      </form>
    </section>
    <section className="bt-crud-panel" aria-label="Active staff assignments">
      <div className="bt-crud-panel-head"><h2>Operational assignments</h2><span>{workspace?.assignments.length ?? 0} shown</span></div>
      {loading ? <p className="bt-crud-empty">Loading organization staff…</p> :
        !workspace?.assignments.length ? <p className="bt-crud-empty">No Project Manager or Site Engineer grants awaiting management.</p> :
        <div className="bt-crud-table-wrap"><table className="bt-crud-table"><thead><tr>
          <th scope="col">Member</th><th scope="col">Role</th><th scope="col">Assignment</th><th scope="col">Action</th>
        </tr></thead><tbody>{workspace.assignments.map((assignment) => <tr key={assignment.id}>
          <td><strong>{memberName(assignment.membershipId)}</strong></td>
          <td>{assignment.role.replaceAll("_", " ")}{assignment.expired ? " · Expired (revoke before reassign)" : ""}</td>
          <td>{assignment.role === "SITE_ENGINEER" ? `${projectName(assignment.projectId)} / ${siteName(assignment.siteId)}` : projectName(assignment.projectId)}</td>
          <td><div className="bt-crud-actions"><button type="button" disabled={saving} onClick={() => void revoke(assignment)}>Revoke</button></div></td>
        </tr>)}</tbody></table></div>}
    </section>
  </div>;
}
