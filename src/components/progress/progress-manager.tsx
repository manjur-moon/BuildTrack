"use client";
import Link from "next/link";
import { useEffect, useState, useRef, type FormEvent } from "react";
import { api, jsonRequest } from "@/components/construction/api";
type Site = {
  id: string;
  projectId: string;
  name: string;
  tasks: { id: string; title: string }[];
  broad: boolean;
  canAttach: boolean;
};
type Report = {
  id: string;
  workDate: string;
  workDescription: string;
  delayReason: string | null;
  observedProgress: string | null;
  taskTitle: string | null;
  reporter: string;
  photos: { id: string; name: string; contentUrl: string }[];
};
type Result = { items: Report[]; total: number; canSubmit: boolean };
export function ProgressManager({
  sites,
  today,
}: {
  sites: Site[];
  today: string;
}) {
  const [siteId, setSite] = useState(sites[0]?.id ?? "");
  const site = sites.find((s) => s.id === siteId);
  const [task, setTask] = useState(
    sites[0]?.broad ? "" : (sites[0]?.tasks[0]?.id ?? ""),
  );
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<Result>();
  const [photos, setPhotos] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const retry = useRef<{ body: string; key: string } | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!site || (!site.broad && !task)) return;
    let active = true;
    const p = new URLSearchParams({
      projectId: site.projectId,
      siteId: site.id,
      page: String(page),
      q: search,
    });
    if (task) p.set("taskId", task);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    api<Result>(`/api/v1/progress-reports?${p}`)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) {
          setError(String(e));
          setData(undefined);
        }
      });
    return () => {
      active = false;
    };
  }, [site, task, page, search, from, to, refresh]);
  useEffect(() => {
    if (!site?.canAttach) return;
    let active = true;
    api<{ items: { id: string; name: string; uploadedByMe: boolean }[] }>(
      `/api/v1/media?kind=SITE&resourceId=${encodeURIComponent(site.id)}&limit=48`,
    )
      .then((v) => {
        if (active) setPhotos(v.items.filter((p) => p.uploadedByMe));
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [site, refresh]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!site || busy) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = {
      projectId: site.projectId,
      siteId: site.id,
      ...(task ? { taskId: task } : {}),
      workDate: String(f.get("workDate")),
      workDescription: String(f.get("workDescription")),
      delayReason: String(f.get("delayReason") ?? ""),
      ...(task && f.get("observedProgress")
        ? { observedProgress: String(f.get("observedProgress")) }
        : {}),
      photoIds: selected,
    };
    const serialized = JSON.stringify(body);
    if (retry.current?.body !== serialized)
      retry.current = { body: serialized, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      await api(
        "/api/v1/progress-reports",
        jsonRequest("POST", body, retry.current.key),
      );
      retry.current = null;
      form.reset();
      setSelected([]);
      setPage(1);
      setRefresh((v) => v + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  const field = "block w-full border rounded p-2 bg-transparent";
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Daily site progress</h1>
      <p>
        Historical work observations. Task workflow remains the authoritative
        source of completion.
      </p>
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
      <label>
        Site
        <select
          className={field}
          value={siteId}
          disabled={busy}
          onChange={(e) => {
            const s = sites.find((x) => x.id === e.target.value);
            setSite(e.target.value);
            setTask(s?.broad ? "" : (s?.tasks[0]?.id ?? ""));
            setPage(1);
            setData(undefined);
            setSelected([]);
            setPhotos([]);
            setError("");
          }}
        >
          {sites.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {!site && <p>No authorized sites.</p>}
      {site && (
        <label>
          Task
          <select
            className={field}
            value={task}
            disabled={busy}
            onChange={(e) => {
              setTask(e.target.value);
              setData(undefined);
              setPage(1);
            }}
          >
            {site.broad && <option value="">Site-wide (all reports)</option>}
            {site.tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        <label>
          Search
          <input
            className={field}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label>
          From
          <input
            className={field}
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          To
          <input
            className={field}
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
      </div>
      {data?.items.map((r) => (
        <article className="border rounded p-4 space-y-2" key={r.id}>
          <h2 className="font-semibold">
            {r.workDate} · {r.taskTitle ?? "Site report"}
          </h2>
          <p className="text-sm">
            {r.reporter} · Observed:{" "}
            {r.observedProgress === null ? "N/A" : `${r.observedProgress}%`}
          </p>
          <p className="whitespace-pre-wrap">{r.workDescription}</p>
          {r.delayReason && <p>Delay: {r.delayReason}</p>}
          {r.photos.map((p) => (
            <a
              className="underline block"
              key={p.id}
              href={p.contentUrl}
              target="_blank"
              rel="noreferrer"
            >
              {p.name}
            </a>
          ))}
        </article>
      ))}
      {!data?.items.length && (
        <p>
          {data
            ? "No reports found."
            : site
              ? "Loading reports…"
              : "Select a site."}
        </p>
      )}
      <div className="flex gap-4">
        <button disabled={page === 1} onClick={() => setPage((v) => v - 1)}>
          Previous
        </button>
        <span>
          Page {page} · {data?.total ?? 0} reports
        </span>
        <button
          disabled={!data || page * 20 >= data.total}
          onClick={() => setPage((v) => v + 1)}
        >
          Next
        </button>
      </div>
      {data?.canSubmit && (
        <form onSubmit={submit} className="border rounded p-4 space-y-3">
          <h2 className="font-semibold">Submit report</h2>
          <label>
            Work date
            <input
              className={field}
              name="workDate"
              type="date"
              required
              defaultValue={today}
              max={today}
            />
          </label>
          <label>
            Work description
            <textarea
              className={field}
              name="workDescription"
              required
              minLength={3}
              maxLength={4000}
            />
          </label>
          <label>
            Delay reason
            <textarea className={field} name="delayReason" maxLength={2000} />
          </label>
          {task && (
            <label>
              Observed progress (%)
              <input
                className={field}
                name="observedProgress"
                type="number"
                min="0"
                max="100"
                step="0.01"
              />
            </label>
          )}
          {site?.canAttach && (
            <fieldset>
              <legend>Attach verified site photos (up to 10)</legend>
              <p className="text-sm">
                Upload first in{" "}
                <Link href="/dashboard/media">Upload photos</Link>
                  Photo evidence
                
                . Only your own photos can be attached; they will move to the
                report.
              </p>
              {photos.map((p) => (
                <label className="block" key={p.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    disabled={
                      busy ||
                      (!selected.includes(p.id) && selected.length >= 10)
                    }
                    onChange={(e) =>
                      setSelected((v) =>
                        e.target.checked
                          ? [...v, p.id]
                          : v.filter((x) => x !== p.id),
                      )
                    }
                  />
                  {p.name}
                </label>
              ))}
            </fieldset>
          )}
          <button
            className="bg-slate-800 text-white rounded px-4 py-2"
            disabled={busy}
          >
            {busy ? "Submitting…" : "Submit report"}
          </button>
        </form>
      )}
    </section>
  );
}
