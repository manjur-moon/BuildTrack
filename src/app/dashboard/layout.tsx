import type { ReactNode } from "react";
import "@/components/dashboard/dashboard.css";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { prisma } from "@/server/db/client";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import { unreadNotificationCount } from "@/server/notifications/service";
import { getDashboardNavigation } from "@/server/dashboard/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { OrganizationGate } from "@/components/dashboard/organization-gate";
import type { OrganizationChoice } from "@/components/dashboard/organization-picker";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) redirect("/login?next=/dashboard");
  if (!session.user.emailVerified) redirect("/account");

  const memberships = await prisma.member.findMany({
    where: { userId: session.user.id, disabledAt: null },
    select: { organizationId: true, role: true, organization: { select: { name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  const organizations: OrganizationChoice[] = memberships.map((member) => ({
    id: member.organizationId,
    name: member.organization.name,
    slug: member.organization.slug,
    membershipRole: member.role,
  }));

  const context = await resolveAuthorizationContext(requestHeaders);
  const activeOrganization = context && organizations.find((organization) => organization.id === context.organizationId);
  if (!context || !activeOrganization) {
    return <OrganizationGate organizations={organizations} userName={session.user.name}/>;
  }

  const roleLabels = Array.from(new Set([
    ...(context.betterAuthRole === "owner" ? ["OWNER"] : []),
    ...context.grants.map((grant) => grant.role.replaceAll("_", " ")),
  ]));
  if (!roleLabels.length) roleLabels.push("MEMBER · ROLE PENDING");

  return <DashboardShell
    groups={getDashboardNavigation(context)}
    unreadCount={await unreadNotificationCount(context)}
    organizations={organizations}
    activeOrganizationId={context.organizationId}
    user={{ name: session.user.name, email: session.user.email }}
    roleLabels={roleLabels}
  >{children}</DashboardShell>;
}
