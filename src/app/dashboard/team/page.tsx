import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { TeamEnrollment } from "@/components/construction/team-enrollment";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import { assertEnrollmentOwner } from "@/server/construction/enrollment";
import "@/components/construction/construction.css";
import "@/components/construction/team-enrollment.css";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const actor = await resolveAuthorizationContext(await headers());
  if (!actor) redirect("/dashboard");
  try { assertEnrollmentOwner(actor); }
  catch { notFound(); }
  return <TeamEnrollment />;
}
