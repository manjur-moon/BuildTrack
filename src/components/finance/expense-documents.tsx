"use client";
import { useState, type FormEvent } from "react";
import { api,jsonRequest } from "@/components/construction/api";
import type { listFinance } from "@/server/finance/service";
type Expense=Awaited<ReturnType<typeof listFinance>>["expenses"][number];
const endpoint="/api/v1/expense-documents";
export function ExpenseDocuments({expense,projectId,locked,setBusy,refresh,onError}:{expense:Expense;projectId:string;locked:boolean;setBusy:(busy:boolean)=>void;refresh:()=>Promise<void>;onError:(message:string)=>void}) {
  const [file,setFile]=useState<File|null>(null);
  async function run(action:()=>Promise<void>) {
    setBusy(true);onError("");
    try {await action();} catch(e){onError(e instanceof Error?e.message:"Document action failed.");}
    finally {try {await refresh();}catch(e){onError(e instanceof Error?e.message:"Refresh failed.");}setBusy(false);}
  }
  function upload(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!file||locked) return;
    if(file.size<1||file.size>8*1024*1024||!["application/pdf","image/jpeg","image/png","image/webp"].includes(file.type)) {onError("Select a PDF, JPEG, PNG or WebP file up to 8 MiB.");return;}
    const form=event.currentTarget;
    void run(async()=>{
      const init=await api<{id:string;uploadUrl:string;uploadHeaders:Record<string,string>}>(endpoint,jsonRequest("POST",{action:"init",projectId,expenseId:expense.id,expectedUpdatedAt:expense.updatedAt,fileName:file.name,mimeType:file.type,byteSize:file.size},crypto.randomUUID()));
      const uploaded=await fetch(init.uploadUrl,{method:"PUT",headers:init.uploadHeaders,body:file,credentials:"omit"});
      if(!uploaded.ok)throw Error("Storage upload failed. Remove the pending document and retry.");
      await api(endpoint,jsonRequest("POST",{action:"complete",projectId,expenseId:expense.id,documentId:init.id},crypto.randomUUID()));
      form.reset();setFile(null);
    });
  }
  function remove(id:string) {
    if(locked||!window.confirm("Remove this draft document?")) return;
    void run(async()=>{await api(endpoint,jsonRequest("POST",{action:"remove",projectId,expenseId:expense.id,documentId:id,expectedUpdatedAt:expense.updatedAt},crypto.randomUUID()));});
  }
  return <details className="min-w-48 space-y-2"><summary className="cursor-pointer font-medium">Documents ({expense.documents.length})</summary>
    {expense.documents.map(d=><div key={d.id} className="rounded border border-slate-400/30 p-2 break-all">
      <p>{d.name} · {Math.ceil(d.byteSize/1024)} KiB</p>
      {d.status==="READY"?<a className="underline" href={`${endpoint}/${encodeURIComponent(d.id)}/content`} target="_blank" rel="noopener noreferrer">Download</a>:<p role="status">Pending upload — posting blocked</p>}
      {expense.canEdit&&<button type="button" disabled={locked} className="ml-2 underline disabled:opacity-50" onClick={()=>remove(d.id)}>Remove</button>}
    </div>)}
    {expense.canEdit&&<form onSubmit={upload} className="space-y-2"><label className="block">PDF or image receipt (8 MiB max)<input type="file" className="block w-full" disabled={locked} accept="application/pdf,image/jpeg,image/png,image/webp" onChange={event=>setFile(event.target.files?.[0]??null)} required/></label><button className="rounded border px-2 py-1 disabled:opacity-50" disabled={locked||!file||expense.documents.length>=10}>Upload document</button></form>}
    {!expense.documents.length&&!expense.canEdit&&<p>No documents.</p>}
  </details>;
}
