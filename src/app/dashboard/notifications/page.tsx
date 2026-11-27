import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import { inboxQuery } from "@/server/notifications/input";
import { listNotifications } from "@/server/notifications/service";
import { InboxAction } from "@/components/notifications/inbox-actions";
import "@/components/notifications/notifications.css";
export const dynamic = "force-dynamic";
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await resolveAuthorizationContext(await headers());
  if (!actor) redirect("/dashboard");
  const parsed = inboxQuery.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : inboxQuery.parse({});
  const result = await listNotifications(actor, query);
  const href = (page: number, filter = query.filter) => `/dashboard/notifications?${new URLSearchParams({ page: String(page), filter })}`;
  const date = new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" });
  return <section className="bt-inbox" key={`${actor.organizationId}:${actor.membershipId}`}>
    <h1>Notifications</h1><p>Personal inbox · {result.unread} unread. Alerts are grouped by category and day, not individual events.</p>
    <div className="bt-inbox-panel"><div className="bt-inbox-bar">
      <InboxAction input={{ action: "refresh" }} label="Check for alerts"/>
      <InboxAction input={{ action: "read-all" }} label="Mark all as read"/>
    </div><p>Check for alerts to evaluate current authorized tasks, inventory, reports and financial conditions. Open the relevant workspace for current details.</p></div>
    <div className="bt-inbox-panel"><nav className="bt-inbox-bar" aria-label="Notification filters">
      {(["all", "unread", "read"] as const).map(filter => <Link key={filter} href={href(1, filter)} aria-current={query.filter === filter ? "page" : undefined}>{filter === "all" ? "All" : filter === "unread" ? "Unread" : "Read"}</Link>)}
    </nav>
    {!result.items.length && <p>No notifications on this page.</p>}
    {result.items.map(item => <article key={item.id} className="bt-inbox-row"><div><h2>{item.title} · {item.readAt ? "Read" : "Unread"}</h2><p>{item.body}</p><time dateTime={item.createdAt}>{date.format(new Date(item.createdAt))}</time></div><div className="bt-inbox-bar"><Link href={item.href}>Open workspace</Link><InboxAction input={{ action: "set-read", id: item.id, read: !item.readAt }} label={item.readAt ? "Mark unread" : "Mark read"}/></div></article>)}
    <nav className="bt-inbox-bar" aria-label="Notification pages"><span>Page {result.page} · {result.total} messages</span>{result.page > 1 && <Link href={href(result.page - 1)}>Previous</Link>}{result.page < 9999 && result.page * result.pageSize < result.total && <Link href={href(result.page + 1)}>Next</Link>}</nav>
    </div>
  </section>;
}
