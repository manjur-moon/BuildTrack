"use client";
import { useState, type FormEvent } from "react";
import type { listFinance } from "@/server/finance/service";
type Data=Awaited<ReturnType<typeof listFinance>>;
type Project={id:string;name:string;code:string};
const field="w-full rounded border border-slate-400/40 bg-transparent p-2";
const button="rounded bg-slate-800 px-3 py-2 text-white disabled:opacity-50";
const panel="rounded-xl border border-slate-400/30 p-4 space-y-3";
export function FinanceManager({projects}:{projects:Project[]}){
  const [project,setProject]=useState("");
  const [data,setData]=useState<Data|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [pending,setPending]=useState<{body:Record<string,unknown>;key:string}|null>(null);
  async function load(id:string,page=1){
    const res=await fetch(`/api/v1/finance?projectId=${encodeURIComponent(id)}&page=${page}`,{cache:"no-store"});
    const result=await res.json();
    if(!res.ok)throw new Error(result.error?.message??"Unable to load finance.");
    setData(result.data);
  }
  async function select(id:string,page=1){
    setBusy(true);setError("");setProject(id);setData(null);
    try{if(id)await load(id,page);}catch(e){setError(e instanceof Error?e.message:"Request failed.");}finally{setBusy(false);}
  }
  async function submit(body:Record<string,unknown>,key:string=crypto.randomUUID()){
    setBusy(true);setError("");
    setPending({body,key});
    try{
      const res=await fetch("/api/v1/finance",{method:"POST",headers:{"content-type":"application/json","idempotency-key":key},body:JSON.stringify(body)});
      const result=await res.json();
      if(!res.ok){if(res.status<500)setPending(null);throw new Error(result.error?.message??"Mutation failed.");}
      setPending(null);setData(null);await load(project);
    }catch(e){setError(e instanceof Error?e.message:"Request failed.");}finally{setBusy(false);}
  }
  function form(e:FormEvent<HTMLFormElement>,action:string){
    e.preventDefault();const values=Object.fromEntries(new FormData(e.currentTarget));
    if(action==="category")void submit({action,name:values.name});
    else if(action==="budget")void submit({action,projectId:project,amount:values.amount,reason:values.reason,expected:data?.summary.approved??null});
    else void submit({action,projectId:project,...values});
  }
  const locked=busy||!!pending;
  return <div className="space-y-5 p-4 md:p-6">
    <header><p className="text-xs uppercase tracking-widest">BuildTrack / Management</p><h1 className="text-3xl font-semibold">Finance</h1><p>Approved budgets, posted expenses and revision history · BDT</p></header>
    <label className="block max-w-xl">Project<select className={field} value={project} disabled={locked} onChange={e=>void select(e.target.value)}><option value="">Select an authorized project</option>{projects.map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label>
    {!projects.length&&<p>No authorized active projects.</p>}
    {busy&&<p role="status">Loading…</p>}{error&&<p role="alert" className="text-red-600">{error}</p>}
    {pending&&!busy&&<div className={panel}><p>Request outcome uncertain. Retry with the same key to avoid duplicate records.</p><button className={button} onClick={()=>void submit(pending.body,pending.key)}>Retry same request</button></div>}
    {data&&<><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Object.entries(data.summary).map(([k,v])=><div key={k} className={panel}><p className="capitalize text-sm">{k}</p><p className="break-all text-xl font-semibold">{v===null?"Unavailable":`${v}${k==="utilization"?"%":""}`}</p></div>)}</div>
    {data.summary.overrun!==null&&data.summary.overrun!=="0.00"&&<p role="alert" className="rounded border border-red-500 p-3">Budget exceeded by BDT {data.summary.overrun}. Legitimate expenses may still be posted.</p>}
    <div className="grid gap-4 lg:grid-cols-2">
    {data.canManage&&<form className={panel} onSubmit={e=>form(e,"budget")}><h2 className="font-semibold">{data.summary.approved===null?"Initial budget":"Revise approved budget"}</h2><label className="block">Amount<input className={field} name="amount" inputMode="decimal" required pattern="[0-9]+(\\.[0-9]{1,2})?"/></label><label className="block">Reason<textarea className={field} name="reason" minLength={8} required/></label><button className={button} disabled={locked}>Save budget</button></form>}
    {data.canCategory&&<form className={panel} onSubmit={e=>form(e,"category")}><h2 className="font-semibold">New expense category</h2><label className="block">Name<input className={field} name="name" minLength={2} required/></label><button className={button} disabled={locked}>Create category</button></form>}
    {data.canDraft&&<form className={panel} onSubmit={e=>form(e,"draft")}><h2 className="font-semibold">Record draft expense</h2><label className="block">Title<input className={field} name="title" required minLength={2}/></label><label className="block">Category<select className={field} name="categoryId" required><option value="">Choose category</option>{data.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="block">Amount<input className={field} name="amount" inputMode="decimal" required/></label><label className="block">Transaction date<input className={field} name="date" type="date" required/></label><label className="block">Description<textarea className={field} name="description"/></label><button className={button} disabled={locked}>Save draft</button></form>}
    </div>
    <section className={panel}><h2 className="font-semibold">Expense ledger</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Date","Title","Category","BDT","Status","Actions"].map(x=><th className="p-2" key={x}>{x}</th>)}</tr></thead><tbody>{data.expenses.map(e=><tr key={e.id} className="border-t border-slate-400/30"><td className="p-2">{e.date}</td><td className="p-2">{e.title}</td><td className="p-2">{e.category}</td><td className="p-2">{e.amount}</td><td className="p-2">{e.status}{e.voidReason&&<p>{e.voidReason}</p>}</td><td className="p-2">{e.canPost&&<button className={button} disabled={locked} onClick={()=>{if(window.confirm("Post this expense permanently?"))void submit({action:"post",projectId:project,expenseId:e.id});}}>Post</button>}{data.canManage&&e.status==="POSTED"&&<form onSubmit={event=>{event.preventDefault();const reason=new FormData(event.currentTarget).get("reason");if(window.confirm("Void this posted expense?"))void submit({action:"void",projectId:project,expenseId:e.id,reason});}}><input aria-label="Void reason" className={field} name="reason" required minLength={8} placeholder="Void reason"/><button className={button} disabled={locked}>Void</button></form>}</td></tr>)}</tbody></table></div>{!data.expenses.length&&<p>No expenses recorded.</p>}<div className="flex gap-3"><button className={button} disabled={locked||data.page===1} onClick={()=>void select(project,data.page-1)}>Previous</button><span>Page {data.page} · {data.total} expenses</span><button className={button} disabled={locked||data.page*20>=data.total} onClick={()=>void select(project,data.page+1)}>Next</button></div></section>
    <section className={panel}><h2 className="font-semibold">Budget revision history (latest 20)</h2>{data.revisions.map(r=><p key={r.id}>#{r.number} · {r.previous} → {r.amount} BDT · {r.reason} · {r.date.slice(0,10)}</p>)}{!data.revisions.length&&<p>No revisions yet.</p>}</section></>}
  </div>;
}
