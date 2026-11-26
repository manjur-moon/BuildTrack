"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FormEvent } from "react";
import type { Project } from "./api";

type Mode = "project" | "site";
const projectStatuses = ["PLANNED", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"];
const siteStatuses = ["PLANNED", "ACTIVE", "ON_HOLD", "CLOSED"];
const projectSorts = [
  ["createdAt", "Created"], ["name", "Name"], ["code", "Code"],
  ["status", "Status"], ["startDate", "Start date"], ["expectedEndDate", "Expected end"],
];
const siteSorts = [
  ["createdAt", "Created"], ["name", "Name"], ["location", "Location"], ["status", "Status"],
];

export function ListControls({ mode, projects = [], privateDatesAllowed = true }: { mode: Mode; projects?: Project[]; privateDatesAllowed?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams.toString();
  const currentProjectId = searchParams.get("projectId") ?? "";
  const knownProject = projects.some((project) => project.id === currentProjectId);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entries = new FormData(event.currentTarget);
    const next = new URLSearchParams();
    for (const key of ["q", "status", "projectId", "from", "to", "sortBy", "order", "limit"]) {
      const value = entries.get(key);
      if (typeof value === "string" && value.trim()) next.set(key, value.trim());
    }
    next.set("page", "1");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return <form key={raw} className="bt-list-controls" role="search" onSubmit={apply}>
    <label className="bt-list-search">Search
      <input type="search" name="q" maxLength={100} defaultValue={searchParams.get("q") ?? ""}
        placeholder={mode === "project" ? "Project name or code" : "Site name or location"} />
    </label>
    <label>Status<select name="status" defaultValue={searchParams.get("status") ?? ""}>
      <option value="">All statuses</option>
      {(mode === "project" ? projectStatuses : siteStatuses).map((status) =>
        <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
    </select></label>
    {mode === "site" && <label>Project
      <select name="projectId" defaultValue={currentProjectId}>
        <option value="">All accessible projects</option>
        {currentProjectId && !knownProject && <option value={currentProjectId}>Current project</option>}
        {projects.map((project) => <option key={project.id} value={project.id}>{project.name} ({project.code})</option>)}
      </select>
    </label>}
    {(mode === "site" || privateDatesAllowed) && <>
      <label>{mode === "project" ? "Start from" : "Created from"}
        <input name="from" type="date" defaultValue={searchParams.get("from") ?? ""}/>
      </label>
      <label>{mode === "project" ? "Start to" : "Created to"}
        <input name="to" type="date" defaultValue={searchParams.get("to") ?? ""}/>
      </label>
    </>}
    <label>Sort by<select name="sortBy" defaultValue={searchParams.get("sortBy") ?? "createdAt"}>
      {(mode === "project" ? projectSorts.filter(([key]) => privateDatesAllowed || !["startDate", "expectedEndDate"].includes(key)) : siteSorts).map(([key, label]) =>
        <option key={key} value={key}>{label}</option>)}
    </select></label>
    <label>Direction<select name="order" defaultValue={searchParams.get("order") ?? "desc"}>
      <option value="desc">Descending</option><option value="asc">Ascending</option>
    </select></label>
    <label>Per page<select name="limit" defaultValue={searchParams.get("limit") ?? "20"}>
      {[10, 20, 50, 100].map((limit) => <option key={limit} value={limit}>{limit}</option>)}
    </select></label>
    <div className="bt-list-control-actions">
      <button className="bt-crud-primary" type="submit">Apply filters</button>
      <button type="button" onClick={() => router.replace(pathname, { scroll: false })}>Reset</button>
    </div>
  </form>;
}

export function ListPagination({ page, limit, total, totalPages }: {
  page: number; limit: number; total: number; totalPages: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const first = total === 0 ? 0 : Math.min((page - 1) * limit + 1, total);
  const last = Math.min(page * limit, total);
  function go(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages) return;
    const next = new URLSearchParams(params.toString());
    next.set("page", String(nextPage));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }
  return <nav className="bt-crud-pagination" aria-label="List pagination">
    <span>{first}–{last} of {total} · Page {page} of {Math.max(totalPages, 1)}</span>
    <button type="button" disabled={page <= 1} onClick={() => go(1)}>First</button>
    <button type="button" disabled={page <= 1} onClick={() => go(page - 1)}>Previous</button>
    <button type="button" disabled={page >= totalPages} onClick={() => go(page + 1)}>Next</button>
    <button type="button" disabled={page >= totalPages} onClick={() => go(totalPages)}>Last</button>
  </nav>;
}
