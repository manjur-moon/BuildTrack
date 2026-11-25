import Link from "next/link";
import { headers } from "next/headers";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import { getDashboardNavigation } from "@/server/dashboard/navigation";
import { BtIcon } from "@/components/dashboard/icons";

export const dynamic = "force-dynamic";

export default async function DashboardOverview() {
  const context = await resolveAuthorizationContext(await headers());
  // Dashboard layout owns the organization-selection screen when there is no active context.
  if (!context) return null;
  const links = getDashboardNavigation(context).flatMap((group) => group.items).filter((item) => item.key !== "overview");
  return <div className="bt-overview">
    <section className="bt-overview-hero" aria-labelledby="bt-overview-title">
      <div className="bt-hero-eyebrow"><span className="bt-eyebrow-rule"/> YOUR WORKSPACE, IN FOCUS</div>
      <h1 id="bt-overview-title">Build with<br/><em>clarity.</em></h1>
      <div className="bt-hero-footer"><p>One secure place to coordinate projects, teams, materials and decisions.</p><span className="bt-hero-monogram" aria-hidden="true">B<span>T</span></span></div>
    </section>

    <section className="bt-overview-section" aria-labelledby="bt-operations-title">
      <div className="bt-section-heading"><div><p className="bt-section-kicker">OPERATIONS / 01</p><h2 id="bt-operations-title">Your control center</h2></div><p>Live dashboards connect when project workflows are implemented in Step 8.</p></div>
      <div className="bt-metric-grid">
        {[
          { label: "Active projects", icon: "building" as const },
          { label: "Open tasks", icon: "check-square" as const },
          { label: "Active sites", icon: "hard-hat" as const },
          { label: "Recorded spend", icon: "wallet" as const },
        ].map((metric, i) => <article className="bt-metric" key={metric.label}>
          <div className="bt-metric-head"><span>{String(i + 1).padStart(2, "0")}</span><BtIcon name={metric.icon} size={20}/></div>
          <p className="bt-metric-value" aria-label="Not connected yet">—</p>
          <div className="bt-metric-bottom"><strong>{metric.label}</strong><span>Data integration pending</span></div>
        </article>)}
      </div>
    </section>

    <section className="bt-overview-section" aria-labelledby="bt-explore-title">
      <div className="bt-section-heading"><div><p className="bt-section-kicker">WORKSPACE / 02</p><h2 id="bt-explore-title">Explore your workspace</h2></div><p>Modules shown are filtered by your current organization and role grants.</p></div>
      {links.length ? <div className="bt-module-grid">{links.slice(0, 6).map((item, i) => <Link href={item.href} className="bt-module-card" key={item.key}>
        <div className="bt-module-card-top"><span>{String(i + 1).padStart(2, "0")}</span><BtIcon name="arrow-up-right" size={18}/></div>
        <BtIcon name={item.icon} size={27}/><div><h3>{item.label}</h3><p>{item.description}</p></div>
      </Link>)}</div> : <div className="bt-empty-state"><h3>Awaiting operational access</h3><p>Your organization owner can assign a project or site role. This dashboard does not grant access automatically.</p></div>}
    </section>
    <section className="bt-notice"><BtIcon name="shield" size={20}/><div><strong>Secure by design</strong><p>Navigation visibility is based on current role grants. Future business APIs enforce authorization again against live records.</p></div></section>
  </div>;
}
