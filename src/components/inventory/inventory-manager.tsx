"use client";

import { useEffect, useState, type FormEvent } from "react";
import { api, jsonRequest, type Page, type Site } from "@/components/construction/api";

type Category = { id: string; name: string };
type Material = { id: string; name: string; sku: string; unit: string; categoryId: string; categoryName: string };
type Catalog = { items: Material[]; categories: Category[]; total: number; page: number; limit: number; canManage: boolean };
type StockLine = { id: string; materialId: string; materialName: string; sku: string; unit: string;
  onHand: string; reorderLevel: string; lowStock: boolean };
type ReqLine = { id: string; materialId: string; materialName: string; sku: string; unit: string;
  quantityRequested: string; quantityApproved: string | null; quantityIssued: string };
type Requisition = { id: string; siteId: string; reason: string; status: string; items: ReqLine[];
  requestedByMembershipId: string; approvedByMembershipId: string | null; requestedAt: string };
type IssueLine = { id: string; materialName: string; sku: string; unit: string;
  issued: string; consumed: string; returned: string; remaining: string };
type MoveLine = { id: string; type: string; materialName: string; materialSku: string;
  quantityDelta: string; reason: string | null; recordedAt: string };
type InventoryPage<T> = { items: T[]; total: number; page: number; limit: number };
type StockPage = InventoryPage<StockLine> & { site: { name: string } };
type Tab = "stock" | "requests" | "usage" | "catalog";
const units = ["PIECE", "BAG", "KILOGRAM", "TONNE", "LITRE", "METRE", "SQUARE_METRE", "CUBIC_METRE", "BOX"];
const tabs: { id: Tab; label: string }[] = [
  { id: "stock", label: "Site Stock" }, { id: "requests", label: "Requisitions" },
  { id: "usage", label: "Consumption & Returns" }, { id: "catalog", label: "Material Catalog" },
];
const labelQty = (v: string, unit: string) => `${v} ${unit.replaceAll("_", " ").toLowerCase()}`;

export function InventoryManager({ canManageCatalog, canRecord, canRequest, canApprove }:
  { canManageCatalog: boolean; canRecord: boolean; canRequest: boolean; canApprove: boolean }) {
  const [tab, setTab] = useState<Tab>("stock");
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [stock, setStock] = useState<StockPage | null>(null);
  const [movements, setMovements] = useState<InventoryPage<MoveLine> | null>(null);
  const [requests, setRequests] = useState<InventoryPage<Requisition> | null>(null);
  const [issues, setIssues] = useState<InventoryPage<IssueLine> | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [newMaterial, setNewMaterial] = useState({ name: "", sku: "", categoryId: "", unit: "BAG" });
  const [movement, setMovement] = useState({ materialId: "", type: "RECEIPT", quantity: "", reason: "" });
  const [threshold, setThreshold] = useState({ materialId: "", reorderLevel: "0" });
  const [requisitionReason, setRequisitionReason] = useState("");
  const [requestLines, setRequestLines] = useState([{ materialId: "", quantity: "" }]);
  const [approvalAmounts, setApprovalAmounts] = useState<Record<string, string>>({});
  const [issueAmounts, setIssueAmounts] = useState<Record<string, string>>({});
  const [usageDraft, setUsageDraft] = useState({ issueItemId: "", action: "consume", quantity: "", note: "" });
  const search = q.trim();
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      api<Page<Site>>( "/api/v1/sites?limit=100", { signal: controller.signal }),
      api<Catalog>("/api/v1/materials?limit=100", { signal: controller.signal }),
    ]).then(([s, c]) => {
      if (controller.signal.aborted) return;
      if (s.status === "fulfilled") setSites(s.value.items);
      if (c.status === "fulfilled") setCatalog(c.value);
      if (s.status === "rejected" || c.status === "rejected") setError("Some inventory selectors could not load. Verify your assigned access and reload.");
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const args = new URLSearchParams({ page: String(page), limit: "20" });
    if (search) args.set("q", search);
    if (tab === "catalog") {
      api<Catalog>(`/api/v1/materials?${args}`, { signal: controller.signal }).then((data) => {
        if (!controller.signal.aborted) { setCatalog(data); setError(""); }
      }).catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Catalog unavailable"); });
      return () => controller.abort();
    }
    if (!siteId) return () => controller.abort();
    args.set("siteId", siteId);
    const common = { signal: controller.signal };
    let request: Promise<void>;
    if (tab === "stock") {
      request = Promise.all([
        api<StockPage>(`/api/v1/inventory?${args}`, common),
        api<InventoryPage<MoveLine>>(`/api/v1/inventory/movements?siteId=${encodeURIComponent(siteId)}&limit=15`, common),
      ]).then(([a, b]) => { if (!controller.signal.aborted) { setStock(a); setMovements(b); setError(""); } });
    } else if (tab === "requests") {
      request = api<InventoryPage<Requisition>>(`/api/v1/material-requests?siteId=${encodeURIComponent(siteId)}&page=${page}&limit=20`, common)
        .then((data) => { if (!controller.signal.aborted) { setRequests(data); setError(""); } });
    } else {
      request = api<InventoryPage<IssueLine>>(`/api/v1/material-issues/items?siteId=${encodeURIComponent(siteId)}&page=${page}&limit=20`, common)
        .then((data) => { if (!controller.signal.aborted) { setIssues(data); setError(""); } });
    }
    request.catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Inventory request failed"); });
    return () => controller.abort();
  }, [siteId, tab, page, search, revision]);
  const materials = catalog?.items ?? [];
  const selectedSite = sites.find((site) => site.id === siteId);
  const current = tab === "stock" ? stock : tab === "requests" ? requests : tab === "usage" ? issues : catalog;
  const refresh = () => setRevision((n) => n + 1);
  const switchTab = (next: Tab) => { setTab(next); setPage(1); setError(""); setNotice(""); };
  async function mutate(event: FormEvent<HTMLFormElement> | null, url: string, method: "POST" | "PATCH", body: object, message: string) {
    event?.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api<unknown>(url, jsonRequest(method, body, crypto.randomUUID()));
      setNotice(message); refresh();
      // Reload catalog because a newly-created material may be needed immediately in a form.
      if (url.startsWith("/api/v1/materials") || url.startsWith("/api/v1/material-categories")) {
        const updated = await api<Catalog>("/api/v1/materials?limit=100");
        setCatalog(updated);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save inventory operation."); }
    finally { setBusy(false); }
  }
  async function decide(request: Requisition, kind: "APPROVE" | "REJECT") {
    if (kind === "REJECT") {
      const reason = window.prompt("Reason for rejecting this requisition (minimum 8 characters):");
      if (!reason) return;
      await mutate(null, `/api/v1/material-requests/${encodeURIComponent(request.id)}/decision`, "PATCH",
        { decision: "REJECT", reason }, "Requisition rejected.");
    } else {
      const lines = request.items.map((line) => ({ itemId: line.id,
        quantityApproved: approvalAmounts[line.id] ?? line.quantityRequested }));
      await mutate(null, `/api/v1/material-requests/${encodeURIComponent(request.id)}/decision`, "PATCH",
        { decision: "APPROVE", lines }, "Requisition approved.");
    }
  }
  async function issue(request: Requisition) {
    const lines = request.items.map((line) => ({ requestItemId: line.id,
      quantity: issueAmounts[line.id] ?? String(Math.round((Number(line.quantityApproved ?? "0") - Number(line.quantityIssued)) * 1000) / 1000) }))
      .filter((line) => Number(line.quantity) > 0);
    if (!lines.length) { setError("Enter a positive issue quantity."); return; }
    await mutate(null, `/api/v1/material-requests/${encodeURIComponent(request.id)}/issues`, "POST", { lines }, "Material issued and site stock updated.");
  }
  return <section className="bt-inv" aria-label="Materials and inventory">
    <header className="bt-inv-head"><div><p className="bt-inv-eyebrow">Construction operations / Materials</p>
      <h1>Materials &amp; Inventory</h1><p>Site-level stock control, approved requisitions and traceable material consumption.</p></div>
      <div className="bt-inv-summary"><span>Inventory ledger</span><strong>Audited</strong></div></header>
    <nav className="bt-inv-tabs" aria-label="Inventory sections">{tabs.map((t) =>
      <button type="button" key={t.id} className={tab === t.id ? "active" : ""}
        aria-current={tab === t.id ? "page" : undefined} onClick={() => switchTab(t.id)}>{t.label}</button>)}</nav>
    <div className="bt-inv-toolbar">
      {tab !== "catalog" && <label>Construction site
        <select value={siteId} onChange={(e) => { setSiteId(e.target.value); setPage(1); setStock(null); setMovements(null); setRequests(null); setIssues(null); }}>
          <option value="">Choose authorized site</option>{sites.map((s) =>
            <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      {(tab === "stock" || tab === "catalog") && <label>Search materials
        <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search SKU or material" /></label>}
      <button type="button" onClick={refresh} aria-label="Refresh inventory">Refresh</button>
    </div>
    {error && <p role="alert" className="bt-inv-alert">{error}</p>}
    {notice && <p role="status" className="bt-inv-notice">{notice}</p>}
    {!siteId && tab !== "catalog" && <p className="bt-inv-empty">Select an authorized site to view its inventory and requisitions.</p>}
    {tab === "catalog" && <div className="bt-inv-stack">
      {canManageCatalog && <div className="bt-inv-grid">
        <form onSubmit={(e) => mutate(e, "/api/v1/material-categories", "POST", { name: categoryName }, "Material category created.")} className="bt-inv-panel">
          <h2>New category</h2><label>Category name<input required minLength={2} value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="Cement & binders"/></label>
          <button disabled={busy} type="submit">Add category</button></form>
        <form onSubmit={(e) => mutate(e, "/api/v1/materials", "POST", newMaterial, "Material added to catalog.")} className="bt-inv-panel">
          <h2>New material</h2><label>Name<input required value={newMaterial.name} onChange={(e) => setNewMaterial({ ...newMaterial, name: e.target.value })}/></label>
          <label>SKU<input required value={newMaterial.sku} onChange={(e) => setNewMaterial({ ...newMaterial, sku: e.target.value.toUpperCase() })}/></label>
          <label>Category<select required value={newMaterial.categoryId} onChange={(e) => setNewMaterial({ ...newMaterial, categoryId: e.target.value })}>
            <option value="">Choose category</option>{catalog?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Unit<select value={newMaterial.unit} onChange={(e) => setNewMaterial({ ...newMaterial, unit: e.target.value })}>
            {units.map((unit) => <option key={unit} value={unit}>{unit.replaceAll("_", " ")}</option>)}</select></label>
          <button type="submit" disabled={busy}>Add material</button></form>
      </div>}
      <div className="bt-inv-panel"><h2>Material catalogue <span>{catalog?.total ?? 0} items</span></h2>
        <div className="bt-inv-table-wrap"><table><thead><tr><th>SKU</th><th>Material</th><th>Category</th><th>Unit</th></tr></thead><tbody>
          {materials.map((m) => <tr key={m.id}><td>{m.sku}</td><td>{m.name}</td><td>{m.categoryName}</td><td>{m.unit.replaceAll("_", " ")}</td></tr>)}
        </tbody></table></div>{!materials.length && <p>No materials found.</p>}
      </div></div>}
    {siteId && tab === "stock" && <div className="bt-inv-stack">
      <div className="bt-inv-metrics"><div><span>Site</span><strong>{selectedSite?.name ?? stock?.site.name}</strong></div>
        <div><span>Stock lines</span><strong>{stock?.total ?? "—"}</strong></div>
        <div><span>Low stock on this page</span><strong>{stock?.items.filter((s) => s.lowStock).length ?? "—"}</strong></div></div>
      {canRecord && <div className="bt-inv-grid">
        <form className="bt-inv-panel" onSubmit={(e) => mutate(e, "/api/v1/inventory/movements", "POST", {
          ...movement, siteId }, "Stock movement recorded.")}><h2>Record stock movement</h2>
          <label>Material<select required value={movement.materialId} onChange={(e) => setMovement({ ...movement, materialId: e.target.value })}>
            <option value="">Select material</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.sku} · {m.name}</option>)}</select></label>
          <label>Movement type<select value={movement.type} onChange={(e) => setMovement({ ...movement, type: e.target.value })}>
            <option value="RECEIPT">Stock receipt</option>{canManageCatalog && <><option value="ADJUSTMENT_IN">Adjustment in</option><option value="ADJUSTMENT_OUT">Adjustment out</option></>}</select></label>
          <label>Quantity<input required min="0.001" step="0.001" type="number" value={movement.quantity} onChange={(e) => setMovement({ ...movement, quantity: e.target.value })}/></label>
          <label>Reason / reference<textarea required minLength={8} value={movement.reason} onChange={(e) => setMovement({ ...movement, reason: e.target.value })}/></label>
          <button disabled={busy} type="submit">Record movement</button></form>
        <form className="bt-inv-panel" onSubmit={(e) => mutate(e, "/api/v1/inventory/threshold", "POST", {
          ...threshold, siteId }, "Low-stock threshold updated.")}><h2>Low-stock threshold</h2>
          <label>Material<select required value={threshold.materialId} onChange={(e) => setThreshold({ ...threshold, materialId: e.target.value })}>
            <option value="">Select material</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.sku} · {m.name}</option>)}</select></label>
          <label>Reorder level<input required type="number" min="0" step="0.001" value={threshold.reorderLevel} onChange={(e) => setThreshold({ ...threshold, reorderLevel: e.target.value })}/></label>
          <button disabled={busy} type="submit">Save threshold</button><p>Shows a low-stock indicator when balance falls to or below this level.</p>
        </form></div>}
      <div className="bt-inv-panel"><h2>Available site stock</h2><div className="bt-inv-table-wrap"><table><thead><tr><th>Material</th><th>On hand</th><th>Reorder</th><th>Status</th></tr></thead><tbody>
        {stock?.items.map((r) => <tr key={r.id}><td><strong>{r.materialName}</strong><small>{r.sku}</small></td>
          <td>{labelQty(r.onHand, r.unit)}</td><td>{r.reorderLevel}</td><td>{r.lowStock ? "LOW STOCK" : "In stock"}</td></tr>)}
        </tbody></table></div>{!stock?.items.length && <p>No site stock recorded yet.</p>}</div>
      <div className="bt-inv-panel"><h2>Recent stock movements</h2><div className="bt-inv-table-wrap"><table><thead><tr><th>Material</th><th>Type</th><th>Change</th><th>Date</th></tr></thead><tbody>
        {movements?.items.map((m) => <tr key={m.id}><td>{m.materialName}</td><td>{m.type}</td><td>{m.quantityDelta}</td><td>{new Date(m.recordedAt).toLocaleString()}</td></tr>)}
      </tbody></table></div></div></div>}
    {siteId && tab === "requests" && <div className="bt-inv-stack">
      {canRequest && <form className="bt-inv-panel" onSubmit={(e) => {
        const site = sites.find((s) => s.id === siteId);
        if (!site) return;
        void mutate(e, "/api/v1/material-requests", "POST", {
          projectId: site.projectId, siteId, reason: requisitionReason, items: requestLines,
        }, "Requisition submitted for approval.");
      }}><h2>Request materials</h2><label>Purpose / work reference<textarea required minLength={8} value={requisitionReason} onChange={(e) => setRequisitionReason(e.target.value)} /></label>
        {requestLines.map((line, idx) => <div className="bt-inv-line" key={idx}>
          <label>Material<select required value={line.materialId} onChange={(e) => setRequestLines((old) => old.map((x, i) => i === idx ? { ...x, materialId: e.target.value } : x))}>
            <option value="">Select</option>{materials.map((m) => <option value={m.id} key={m.id}>{m.sku} · {m.name}</option>)}</select></label>
          <label>Quantity<input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => setRequestLines((old) => old.map((x,i) => i === idx ? { ...x, quantity: e.target.value } : x))}/></label>
          {requestLines.length > 1 && <button type="button" onClick={() => setRequestLines((old) => old.filter((_, i) => i !== idx))}>Remove</button>}
        </div>)}
        <div className="bt-inv-actions"><button type="button" disabled={requestLines.length >= 25} onClick={() => setRequestLines((old) => [...old, { materialId: "", quantity: "" }])}>Add line</button>
          <button disabled={busy} type="submit">Submit requisition</button></div></form>}
      <div className="bt-inv-panel"><h2>Site requisitions</h2>{requests?.items.map((r) => <article className="bt-inv-request" key={r.id}>
        <header><strong>{r.reason}</strong><span>{r.status.replaceAll("_", " ")}</span></header>
        <small>{new Date(r.requestedAt).toLocaleDateString()} · Ref {r.id.slice(0, 8)}</small>
        <div className="bt-inv-table-wrap"><table><thead><tr><th>Material</th><th>Requested</th><th>Approved</th><th>Issued</th></tr></thead><tbody>
          {r.items.map((line) => <tr key={line.id}><td>{line.materialName}</td><td>{line.quantityRequested}</td><td>{line.quantityApproved ?? "—"}</td><td>{line.quantityIssued}</td></tr>)}
        </tbody></table></div>
        {canApprove && r.status === "PENDING" && <div className="bt-inv-decision"><p>Approval quantities (default: requested quantity)</p>
          {r.items.map((line) => <label key={line.id}>{line.sku}<input type="number" min="0" step="0.001" value={approvalAmounts[line.id] ?? line.quantityRequested}
            onChange={(e) => setApprovalAmounts((old) => ({ ...old, [line.id]: e.target.value }))}/></label>)}
          <div className="bt-inv-actions"><button type="button" disabled={busy} onClick={() => decide(r, "APPROVE")}>Approve</button>
            <button type="button" disabled={busy} onClick={() => decide(r, "REJECT")}>Reject</button></div></div>}
        {canRecord && ["APPROVED", "PARTIALLY_FULFILLED"].includes(r.status) && <div className="bt-inv-decision"><p>Issue quantities (default: outstanding approved quantity)</p>
          {r.items.map((line) => <label key={line.id}>{line.sku}<input type="number" min="0" step="0.001"
            value={issueAmounts[line.id] ?? String(Math.max(0, Number(line.quantityApproved ?? "0") - Number(line.quantityIssued)))}
            onChange={(e) => setIssueAmounts((old) => ({ ...old, [line.id]: e.target.value }))}/></label>)}
          <button type="button" disabled={busy} onClick={() => issue(r)}>Issue approved materials</button></div>}
      </article>)}{!requests?.items.length && <p>No requisitions for this site.</p>}</div></div>}
    {siteId && tab === "usage" && <div className="bt-inv-stack">
      {canRecord && <form className="bt-inv-panel" onSubmit={(e) => mutate(e,
        `/api/v1/material-issues/items/${encodeURIComponent(usageDraft.issueItemId)}/${usageDraft.action === "consume" ? "consume" : "return"}`, "POST",
        usageDraft.action === "consume" ? { quantity: usageDraft.quantity, note: usageDraft.note || undefined } :
          { quantity: usageDraft.quantity, reason: usageDraft.note },
        usageDraft.action === "consume" ? "Consumption recorded." : "Unused material returned to site stock.")}>
        <h2>Record issued material usage</h2>
        <label>Issued line<select required value={usageDraft.issueItemId} onChange={(e) => setUsageDraft({ ...usageDraft, issueItemId: e.target.value })}>
          <option value="">Choose issued material</option>{issues?.items.filter((r) => Number(r.remaining) > 0).map((r) =>
            <option value={r.id} key={r.id}>{r.sku} · {r.materialName} · remaining {r.remaining}</option>)}</select></label>
        <label>Action<select value={usageDraft.action} onChange={(e) => setUsageDraft({ ...usageDraft, action: e.target.value })}>
          <option value="consume">Consume on site</option><option value="return">Return unused stock</option></select></label>
        <label>Quantity<input type="number" min="0.001" step="0.001" required value={usageDraft.quantity} onChange={(e) => setUsageDraft({ ...usageDraft, quantity: e.target.value })}/></label>
        <label>{usageDraft.action === "return" ? "Return reason (minimum 8 characters)" : "Usage note (optional)"}<textarea
          required={usageDraft.action === "return"} minLength={usageDraft.action === "return" ? 8 : undefined}
          value={usageDraft.note} onChange={(e) => setUsageDraft({ ...usageDraft, note: e.target.value })}/></label>
        <button disabled={busy} type="submit">Record {usageDraft.action}</button>
        <p>Consumption documents work already issued. It does not deduct site stock a second time.</p></form>}
      <div className="bt-inv-panel"><h2>Issued material ledger</h2><div className="bt-inv-table-wrap"><table><thead><tr><th>Material</th><th>Issued</th><th>Consumed</th><th>Returned</th><th>Remaining</th></tr></thead><tbody>
        {issues?.items.map((r) => <tr key={r.id}><td>{r.materialName}<small>{r.sku}</small></td>
          <td>{r.issued}</td><td>{r.consumed}</td><td>{r.returned}</td><td>{r.remaining}</td></tr>)}
      </tbody></table></div>{!issues?.items.length && <p>No material issues recorded.</p>}</div></div>}
    {(siteId || tab === "catalog") && current && current.total > current.limit && <div className="bt-inv-pager">
      <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
      <span>Page {page} of {Math.ceil(current.total/current.limit)}</span>
      <button type="button" disabled={page * current.limit >= current.total} onClick={() => setPage((p) => p + 1)}>Next</button>
    </div>}
  </section>;
}
