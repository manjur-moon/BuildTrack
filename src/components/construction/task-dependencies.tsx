"use client";
import { useEffect, useState } from "react";
import { api, jsonRequest } from "./api";
type Data = { items: { predecessorTaskId: string; predecessor: { title: string; status: string; archivedAt: string | null } }[];
  candidates: { id: string; title: string; status: string }[]; truncated: boolean };
export function TaskDependencies({ taskId, editable, onChange }: { taskId: string; editable: boolean; onChange: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [choice, setChoice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const endpoint = `/api/v1/tasks/${encodeURIComponent(taskId)}/dependencies`;
  useEffect(() => {
    const controller = new AbortController();
    api<Data>(endpoint, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setData(result);
    }).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Unable to load prerequisites."); });
    return () => controller.abort();
  }, [endpoint, version]);
  async function change(predecessorId: string, operation: "add" | "remove") {
    setBusy(true); setError("");
    try {
      await api(endpoint, jsonRequest("PATCH", { predecessorId, operation }));
      setChoice(""); setVersion((v) => v + 1); onChange();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to change prerequisite."); }
    finally { setBusy(false); }
  }
  return <section aria-label="Task prerequisites"><h3>Prerequisites</h3>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading prerequisites…</p>}
    {data && <>{!data.items.length && <p>No prerequisites.</p>}
      {data.items.map((item) => <div className="bt-task-assignee" key={item.predecessorTaskId}>
        <span>{item.predecessor.title} · {item.predecessor.status}{item.predecessor.archivedAt ? " (archived)" : ""}</span>
        {editable && <button type="button" disabled={busy} onClick={() => void change(item.predecessorTaskId, "remove")}>Remove</button>}</div>)}
      {editable && <div className="bt-task-add"><label>Predecessor task<select value={choice} onChange={(e) => setChoice(e.target.value)}>
        <option value="">Select prerequisite</option>{data.candidates.filter((c) => !data.items.some((i) => i.predecessorTaskId === c.id)).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <button type="button" disabled={busy || !choice} onClick={() => void change(choice, "add")}>Add prerequisite</button>
        {data.truncated && <p>Showing first 100 candidates. Additional candidates require a paginated picker.</p>}</div>}</>}
  </section>;
}
