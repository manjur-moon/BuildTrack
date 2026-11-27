import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import { getPermittedSection } from "@/server/dashboard/navigation";
import { KanbanBoard } from "@/components/construction/kanban-board";
import "@/components/construction/construction.css";
import "@/components/construction/kanban.css";

export const dynamic = "force-dynamic";
export default async function TaskBoardPage() {
  const actor = await resolveAuthorizationContext(await headers());
  if (!actor) redirect("/dashboard");
  if (!getPermittedSection(actor, "tasks")) notFound();
  return <KanbanBoard key={`${actor.organizationId}:${actor.membershipId}`} />;
}
