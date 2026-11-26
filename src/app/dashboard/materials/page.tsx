import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import { getPermittedSection } from "@/server/dashboard/navigation";
import { hasPermission } from "@/server/rbac/policy";
import { InventoryManager } from "@/components/inventory/inventory-manager";
import "@/components/inventory/inventory.css";

export const dynamic = "force-dynamic";
export default async function MaterialsPage() {
  const actor = await resolveAuthorizationContext(await headers());
  if (!actor) redirect("/dashboard");
  if (!getPermittedSection(actor, "materials")) notFound();
  const probes = [
    { organizationId: actor.organizationId, projectId: "__probe__", siteId: "__probe__" },
    ...actor.grants.map((g) => ({ organizationId: actor.organizationId,
      projectId: g.scope === "organization" ? "__probe__" : g.projectId,
      siteId: g.scope === "site" ? g.siteId : "__probe__",
    })),
  ];
  const permits = (p: "stock:record" | "material-request:create" | "material-request:approve") =>
    probes.some((r) => hasPermission(actor, p, r));
  return <InventoryManager
    canManageCatalog={hasPermission(actor, "material:manage", { organizationId: actor.organizationId })}
    canRecord={permits("stock:record")}
    canRequest={permits("material-request:create")}
    canApprove={permits("material-request:approve")}
  />;
}
