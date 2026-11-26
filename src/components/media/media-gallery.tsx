"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { api, type Page, type Project, type Site } from "@/components/construction/api";

const MAX_BYTES = 8 * 1024 * 1024;
const MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
type Kind = "PROJECT" | "SITE";
type Choice = { id: string; label: string };
type Photo = { id: string; name: string; mimeType: string; byteSize: number; createdAt: string; canDelete: boolean; contentUrl: string };
type PhotoPage = { items: Photo[]; total: number; page: number; limit: number; totalPages: number; canUpload: boolean };
type InitResponse = { id: string; uploadUrl: string; uploadHeaders: Record<string,string>; expiresInSeconds: number; maxBytes: number };

function formatSize(bytes: number) { return `${(bytes / 1024 / 1024).toFixed(2)} MB`; }

export function MediaGallery() {
  const params = useSearchParams();
  const initialKind: Kind = params.get("kind") === "SITE" ? "SITE" : "PROJECT";
  const [kind, setKind] = useState<Kind>(initialKind);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [choices, setChoices] = useState<Choice[]>([]);
  const [choiceKey, setChoiceKey] = useState("");
  const [chosenId, setChosenId] = useState(params.get("resourceId") ?? "");
  const [page, setPage] = useState(1);
  const [refreshId, setRefreshId] = useState(0);
  const [media, setMedia] = useState<{ key: string; data: PhotoPage } | null>(null);
  const [loadingChoices, setLoadingChoices] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadStage, setUploadStage] = useState("");

  const reload = useCallback(() => setRefreshId((n) => n + 1), []);
  const galleryKey = `${kind}:${chosenId}:${page}:${refreshId}`;
  const photos = media?.key === galleryKey ? media.data : null;

  useEffect(() => {
    const abort = new AbortController();
    const key = `${kind}:${search}`;
    const query = new URLSearchParams({ limit: "100", ...(search ? { q: search } : {}) });
    const endpoint = kind === "PROJECT" ? "/api/v1/projects" : "/api/v1/sites";
    const result = kind === "PROJECT"
      ? api<Page<Project>>(`${endpoint}?${query}`, { signal: abort.signal }).then((response) => response.items.filter((item) => item.visibility === "full").map((item) => ({ id: item.id, label: `${item.code} · ${item.name}` })))
      : api<Page<Site>>(`${endpoint}?${query}`, { signal: abort.signal }).then((response) => response.items.map((item) => ({ id: item.id, label: item.name }))); 
    result.then((items) => { if (!abort.signal.aborted) { setChoices(items); setChoiceKey(key); setLoadingChoices(false); } })
      .catch((reason: unknown) => { if (!abort.signal.aborted) { setChoices([]); setChoiceKey(key); setLoadingChoices(false); setError(reason instanceof Error ? reason.message : "Resources could not be loaded."); } });
    return () => abort.abort();
  }, [kind, search]);

  useEffect(() => {
    if (!chosenId) return;
    const abort = new AbortController();
    const query = new URLSearchParams({ kind, resourceId: chosenId, page: String(page), limit: "24" });
    api<PhotoPage>(`/api/v1/media?${query}`, { signal: abort.signal })
      .then((data) => { if (!abort.signal.aborted) { setMedia({ key: galleryKey, data }); setError(""); } })
      .catch((reason: unknown) => { if (!abort.signal.aborted) { setMedia(null); setError(reason instanceof Error ? reason.message : "Gallery could not be loaded."); } });
    return () => abort.abort();
  }, [kind, chosenId, page, refreshId, galleryKey]);

  function chooseKind(next: Kind) {
    setKind(next); setChosenId(""); setMedia(null); setChoices([]); setChoiceKey("");
    setSearch(""); setSearchDraft(""); setPage(1); setError(""); setNotice("");
    setLoadingChoices(true);
  }
  function selectResource(value: string) {
    setChosenId(value); setMedia(null); setPage(1); setNotice(""); setError("");
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !chosenId || working) return;
    if (!MIME.has(file.type) || file.size < 1 || file.size > MAX_BYTES) {
      setError("Choose a JPEG, PNG or WebP image of at most 8 MB."); return;
    }
    setWorking(true); setError(""); setNotice("");
    try {
      setUploadStage("1/3 · Preparing secure upload");
      const pending = await api<InitResponse>("/api/v1/media/init", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, resourceId: chosenId, fileName: file.name, mimeType: file.type, byteSize: file.size }),
      });
      setUploadStage("2/3 · Uploading to private storage");
      const upload = await fetch(pending.uploadUrl, { method: "PUT", headers: pending.uploadHeaders, body: file, credentials: "omit" });
      if (!upload.ok) throw new Error(`Storage rejected upload (${upload.status}). Check bucket CORS configuration.`);
      setUploadStage("3/3 · Validating and removing metadata");
      await api<Photo>(`/api/v1/media/${encodeURIComponent(pending.id)}/complete`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      setNotice("Photo uploaded, normalized and added to the private gallery.");
      setPage(1); reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Upload failed."); }
    finally { setUploadStage(""); setWorking(false); }
  }
  async function removePhoto(photo: Photo) {
    if (working || !window.confirm(`Delete ${photo.name}? The audit record will remain.`)) return;
    setWorking(true); setError(""); setNotice("");
    try {
      await api(`/api/v1/media/${encodeURIComponent(photo.id)}`, { method: "DELETE" });
      setNotice("Photo deleted. Audit history retained."); reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to delete photo."); }
    finally { setWorking(false); }
  }
  const visibleChoices = choiceKey === `${kind}:${search}` ? choices : [];
  return <div className="bt-media-page">
    <header className="bt-media-heading"><p className="bt-media-eyebrow">PROJECT OPERATIONS / MEDIA</p><h1>Construction evidence</h1>
      <p>Private, verified project and site photographs. Every upload is associated with an authorized resource.</p></header>
    <section className="bt-media-controls" aria-label="Media gallery controls">
      <div className="bt-media-tabs" role="group" aria-label="Gallery type">
        <button type="button" aria-pressed={kind === "PROJECT"} onClick={() => chooseKind("PROJECT")}>Project photos</button>
        <button type="button" aria-pressed={kind === "SITE"} onClick={() => chooseKind("SITE")}>Site evidence</button>
      </div>
      <form className="bt-media-search" onSubmit={(event) => { event.preventDefault(); const next = searchDraft.trim(); setLoadingChoices(next !== search); setSearch(next); }}>
        <label htmlFor="media-search">Find an authorized {kind === "PROJECT" ? "project" : "site"}</label>
        <div><input id="media-search" maxLength={100} placeholder="Search name or code" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)}/><button type="submit">Search</button></div>
      </form>
      <label className="bt-media-selector">Choose {kind === "PROJECT" ? "project" : "site"}
        <select value={chosenId} onChange={(event) => selectResource(event.target.value)}>
          <option value="">Select an authorized resource</option>
          {chosenId && !visibleChoices.some((item) => item.id === chosenId) && <option value={chosenId}>Selected resource</option>}
          {visibleChoices.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      {loadingChoices && <p className="bt-media-note">Loading authorized resources…</p>}
      <p className="bt-media-note">Search returns up to 100 matches; narrow the query if your workspace contains more.</p>
    </section>
    {error && <p className="bt-media-feedback" role="alert">{error}</p>}
    {notice && <p className="bt-media-feedback" role="status">{notice}</p>}
    {chosenId && <section className="bt-media-section" aria-label="Private media gallery">
      <div className="bt-media-section-head"><div><p className="bt-media-eyebrow">PRIVATE COLLECTION</p><h2>{photos ? `${photos.total} photographs` : "Loading photographs…"}</h2></div>
        {photos?.canUpload && <label className="bt-media-upload">{working ? "Processing…" : "+ Upload photo"}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={working} onChange={(event) => void upload(event)}/>
        </label>}
      </div>
      {uploadStage && <p className="bt-media-stage" role="status">{uploadStage}</p>}
      <p className="bt-media-note">JPEG, PNG or WebP · 8 MB maximum · EXIF/GPS removed · stored privately</p>
      {photos && photos.items.length === 0 && <p className="bt-media-empty">No photos yet. Authorized editors can add verified construction evidence.</p>}
      {photos && <div className="bt-media-grid">{photos.items.map((photo) => <article className="bt-media-tile" key={photo.id}>
        <a href={photo.contentUrl} target="_blank" rel="noreferrer" aria-label={`Open ${photo.name}`}>
          <Image alt={photo.name} src={photo.contentUrl} width={480} height={320} unoptimized/>
        </a>
        <div className="bt-media-caption"><div><strong title={photo.name}>{photo.name}</strong>
          <small>{new Date(photo.createdAt).toLocaleDateString()} · {formatSize(photo.byteSize)}</small></div>
          {photo.canDelete && <button type="button" disabled={working} onClick={() => void removePhoto(photo)}>Delete</button>}
        </div>
      </article>)}</div>}
      {photos && photos.totalPages > 1 && <nav aria-label="Media pagination" className="bt-media-pagination">
        <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
        <span>Page {photos.page} of {photos.totalPages}</span>
        <button type="button" disabled={page >= photos.totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
      </nav>}
    </section>}
    {!chosenId && <p className="bt-media-empty">Choose a project or site to see its private construction photographs.</p>}
  </div>;
}
