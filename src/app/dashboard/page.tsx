import Link from "next/link";
import { headers } from "next/headers";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import { getDashboardNavigation, type DashboardIcon } from "@/server/dashboard/navigation";
import { loadDashboardAnalytics } from "@/server/dashboard/analytics";
import { BtIcon } from "@/components/dashboard/icons";
import "@/components/dashboard/analytics.css";

export const dynamic = "force-dynamic";
type Metric = {label:string;value:string|number;detail:string;icon:DashboardIcon};
function Metrics({items}:{items:Metric[]}) {
  return <div className="bt-metric-grid">{items.map((m,i)=><article className="bt-metric bt-live-metric" key={m.label}>
    <div className="bt-metric-head"><span>{String(i+1).padStart(2,"0")}</span><BtIcon name={m.icon} size={20}/></div>
    <p className="bt-metric-value">{m.value}</p><div className="bt-metric-bottom"><strong>{m.label}</strong><span>{m.detail}</span></div>
  </article>)}</div>;
}
// Format exact decimal strings without converting monetary values to floating point.
function bdt(value:string|null) {
  if(value===null)return "N/A";
  const [whole,fraction="00"]=value.split(".");
  return `${whole.startsWith("-")?"−":""}৳${BigInt(whole.replace("-","")).toLocaleString("en-BD")}.${fraction}`;
}
export default async function DashboardOverview() {
  const context = await resolveAuthorizationContext(await headers());
  if (!context) return null;
  const data = await loadDashboardAnalytics(context);
  const links = getDashboardNavigation(context).flatMap(g=>g.items).filter(i=>i.key!=="overview");
  const operational:Metric[]=[];
  const {projects:p,tasks:t,sites:s,inventory:i,finance:f}=data;
  if(p)operational.push(
    {label:"Total projects",value:p.total,detail:"Non-archived projects",icon:"building"},
    {label:"Active projects",value:p.active,detail:"ACTIVE lifecycle",icon:"building"},
    {label:"Completed projects",value:p.completed,detail:`Completion rate ${p.completion===null?"N/A":p.completion+"%"}`,icon:"check-square"},
    {label:"Delayed projects",value:p.delayed,detail:"Past expected end date",icon:"chart"},
    {label:"At-risk projects",value:p.atRisk,detail:"Overdue incomplete tasks",icon:"chart"},
    {label:"Milestones achieved",value:`${p.milestoneAchieved}/${p.milestoneTotal}`,detail:"Non-cancelled milestones",icon:"check-square"});
  else if(data.summaryProjects!==null)operational.push({label:"Authorized projects",value:data.summaryProjects,detail:"Summary access only",icon:"building"});
  if(t)operational.push({label:"Open tasks",value:t.open,detail:"Visible incomplete work",icon:"check-square"},
    {label:"My open tasks",value:t.assigned,detail:"Assigned to you",icon:"check-square"},
    {label:"Blocked tasks",value:t.blocked,detail:"Incomplete prerequisites",icon:"check-square"},
    {label:"Overdue tasks",value:t.overdue,detail:"Past due date",icon:"check-square"});
  if(s)operational.push({label:"Active sites",value:s.active,detail:`${s.total} accessible sites`,icon:"hard-hat"});
  if(i)operational.push({label:"Inventory lines",value:i.stockLines,detail:"Accessible site/material balances",icon:"boxes"},
    {label:"Low-stock lines",value:i.lowStock,detail:"Positive reorder level reached",icon:"boxes"},
    {label:"Pending requests",value:i.pendingRequests,detail:"Accessible inventory sites",icon:"boxes"});
  if(data.reportsToday!==null)operational.push({label:"Reports today",value:data.reportsToday,detail:"Accessible sites · work date",icon:"check-square"});
  if(data.ownReports!==null)operational.push({label:"My task reports",value:data.ownReports,detail:"Currently accessible tasks",icon:"check-square"});
  const trendMax=f?f.trend.reduce((max,r)=>{const n=BigInt(r.amount.replace(".",""));return n>max?n:max;},0n):0n;
  return <div className="bt-overview">
    <section className="bt-overview-hero" aria-labelledby="bt-overview-title">
      <div className="bt-hero-eyebrow"><span className="bt-eyebrow-rule"/> YOUR WORKSPACE, IN FOCUS</div>
      <h1 id="bt-overview-title">Build with<br/><em>clarity.</em></h1>
      <div className="bt-hero-footer"><p>{data.roleLabels.length?data.roleLabels.map(r=>r.replaceAll("_"," ")).join(" · "):"Awaiting operational access"}<br/>Live overview · {data.today} · Asia/Dhaka</p><span className="bt-hero-monogram" aria-hidden="true">B<span>T</span></span></div>
    </section>
    {operational.length>0&&<section className="bt-overview-section" aria-labelledby="bt-operations-title">
      <div className="bt-section-heading"><div><p className="bt-section-kicker">OPERATIONS / 01</p><h2 id="bt-operations-title">Your control center</h2></div><p>Live, permission-scoped operational metrics.</p></div>
      <Metrics items={operational}/>
    </section>}
    {f&&<section className="bt-overview-section" aria-labelledby="bt-finance-title">
      <div className="bt-section-heading"><div><p className="bt-section-kicker">FINANCE / BDT</p><h2 id="bt-finance-title">Financial position</h2></div><Link href="/dashboard/finance">Open Finance</Link></div>
      <Metrics items={[
        {label:"Approved budget",value:bdt(f.approved),detail:`${f.budgetedProjects} budgeted projects`,icon:"wallet"},
        {label:"Posted expenses",value:bdt(f.actual),detail:"Draft and voided excluded",icon:"wallet"},
        {label:"Remaining budget",value:bdt(f.remaining),detail:"Approved less posted spend on budgeted projects",icon:"wallet"},
        {label:"Budget utilization",value:f.utilization===null?"N/A":f.utilization+"%",detail:"Budgeted projects only",icon:"chart"},
        {label:"Over-budget projects",value:f.overBudget,detail:"Posted spend exceeds approved budget",icon:"chart"},
        {label:"Unbudgeted spend",value:bdt(f.unbudgetedSpend),detail:"Posted costs without approved budget",icon:"wallet"},
      ]}/>
      <div className="bt-analytics-panel"><h3>Monthly posted expenditure</h3><p>Last six calendar months · current month through today</p>
        <div className="bt-trend">{f.trend.map(r=>{const amount=BigInt(r.amount.replace(".","")); const percent=trendMax===0n?0:Number(amount*10000n/trendMax)/100;return <div className="bt-trend-row" key={r.label}><span>{r.label}</span><div className="bt-trend-track" aria-hidden="true"><div style={{width:`${percent}%`}}/></div><strong>{bdt(r.amount)}</strong></div>;})}</div>
      </div>
    </section>}
    {p&&<section className="bt-overview-section" aria-labelledby="bt-project-progress"><div className="bt-section-heading"><div><p className="bt-section-kicker">PORTFOLIO</p><h2 id="bt-project-progress">Project progress</h2></div><Link href="/dashboard/projects">All projects</Link></div>
      <div className="bt-analytics-panel"><p>Most recently updated projects · equal-weight task progress · archived tasks excluded</p>
      {p.recent.length?<div className="bt-analytics-table"><table><thead><tr><th>Project</th><th>Status</th><th>Expected end</th><th>Progress</th></tr></thead><tbody>{p.recent.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.status.replaceAll("_"," ")}</td><td>{r.due}</td><td><div className="bt-progress-cell"><progress max={100} value={r.progress} aria-label={`${r.name} progress`}/><span>{r.progress.toFixed(1)}%</span></div></td></tr>)}</tbody></table></div>:<p>No accessible projects yet.</p>}</div>
    </section>}
    {t&&<section className="bt-overview-section" aria-labelledby="bt-upcoming-tasks"><div className="bt-section-heading"><div><p className="bt-section-kicker">YOUR WORK</p><h2 id="bt-upcoming-tasks">Upcoming assigned tasks</h2></div><Link href="/dashboard/tasks">All tasks</Link></div>
      <div className="bt-analytics-panel">{t.upcoming.length?<div className="bt-analytics-table"><table><thead><tr><th>Task</th><th>Status</th><th>Due date</th></tr></thead><tbody>{t.upcoming.map(r=><tr key={r.id}><td>{r.title}</td><td>{r.status.replaceAll("_"," ")}</td><td>{r.due}</td></tr>)}</tbody></table></div>:<p>No upcoming incomplete tasks assigned to you.</p>}</div>
    </section>}
    <section className="bt-overview-section" aria-labelledby="bt-explore-title">
      <div className="bt-section-heading"><div><p className="bt-section-kicker">WORKSPACE</p><h2 id="bt-explore-title">Explore your workspace</h2></div><p>Modules are filtered by your current role grants.</p></div>
      {links.length?<div className="bt-module-grid">{links.map((item,index)=><Link href={item.href} className="bt-module-card" key={item.key}><div className="bt-module-card-top"><span>{String(index+1).padStart(2,"0")}</span><BtIcon name="arrow-up-right" size={18}/></div><BtIcon name={item.icon} size={27}/><div><h3>{item.label}</h3><p>{item.description}</p></div></Link>)}</div>:<div className="bt-empty-state"><h3>Awaiting operational access</h3><p>Your organization owner can assign a project or site role.</p></div>}
    </section>
    <section className="bt-notice"><BtIcon name="shield" size={20}/><div><strong>Secure by design</strong><p>All analytics are calculated on the server from the current organization and authorized resource scope.</p></div></section>
  </div>;
}
