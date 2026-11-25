import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import { getPermittedSection } from "@/server/dashboard/navigation";
import { BtIcon } from "@/components/dashboard/icons";

export const dynamic = "force-dynamic";

export default async function DashboardModulePage({ params }: { params: Promise<{ section: string }> }) {
  const context = await resolveAuthorizationContext(await headers());
  if (!context) redirect("/dashboard");
  const { section } = await params;
  const item = getPermittedSection(context, section);
  if (!item) notFound();
  return <div className="bt-module-page">
    <Link href="/dashboard" className="bt-back-link"><BtIcon name="arrow-left" size={17}/> Return to overview</Link>
    <div className="bt-module-hero"><div><p className="bt-section-kicker">BUILDTRACK / MODULE</p><h1>{item.label}<span className="bt-module-dot">.</span></h1><p>{item.description}</p></div><BtIcon name={item.icon} size={52}/></div>
    <div className="bt-module-coming-soon"><p className="bt-section-kicker">MODULE FOUNDATION</p><h2>Designed for the work ahead.</h2><p>The responsive navigation and permission boundary are in place. This module&apos;s database-backed workflows are part of Step 8 onward; no demo data is being represented as live records.</p></div>
  </div>;
}
