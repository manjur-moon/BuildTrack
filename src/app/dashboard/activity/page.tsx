import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import { activityQuery } from "@/server/notifications/input";
import { canViewActivity } from "@/server/notifications/rules";
import { listActivity } from "@/server/notifications/service";
import "@/components/notifications/notifications.css";
export const dynamic = "force-dynamic";
export default async function ActivityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await resolveAuthorizationContext(await headers());
  if (!actor) redirect("/dashboard");
  if (!canViewActivity(actor)) notFound();
  const parsed = activityQuery.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : activityQuery.parse({});
  const result = await listActivity(actor, query);
  const href = (page: number) => `/dashboard/activity?${new URLSearchParams({ page: String(page), q: query.q })}`;
  const date = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });
  return <section className="bt-inbox"><h1>Activity history</h1><p>Organization audit history · read-only metadata · Asia/Dhaka time.</p>
    <div className="bt-inbox-panel"><form action="/dashboard/activity" method="get" className="bt-inbox-bar"><label htmlFor="activity-search">Search action or resource type</label><input id="activity-search" name="q" defaultValue={query.q} maxLength={100}/><button type="submit">Search</button><Link href="/dashboard/activity">Clear</Link></form>
    {!result.items.length ? <p>No audit events on this page.</p> : <div className="bt-inbox-table"><table><caption>Authorized audit event metadata</caption><thead><tr><th scope="col">Time</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Resource</th></tr></thead><tbody>{result.items.map(row => <tr key={row.id}><td><time dateTime={row.createdAt}>{date.format(new Date(row.createdAt))}</time></td><td>{row.actorName}</td><td>{row.action}</td><td>{row.resourceType}</td></tr>)}</tbody></table></div>}
    <nav className="bt-inbox-bar" aria-label="Activity pages"><span>Page {result.page} · {result.total} events</span>{result.page > 1 && <Link href={href(result.page - 1)}>Previous</Link>}{result.page < 9999 && result.page * result.pageSize < result.total && <Link href={href(result.page + 1)}>Next</Link>}</nav></div>
  </section>;
}
