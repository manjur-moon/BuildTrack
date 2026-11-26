import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { MediaGallery } from "@/components/media/media-gallery";
import { getPermittedSection } from "@/server/dashboard/navigation";
import { resolveAuthorizationContext } from "@/server/rbac/context";
import "@/components/media/media.css";

export const dynamic = "force-dynamic";
export default async function MediaPage() {
  const actor = await resolveAuthorizationContext(await headers());
  if (!actor) redirect("/dashboard");
  if (!getPermittedSection(actor, "media")) notFound();
  return <Suspense fallback={<p>Loading media workspace…</p>}><MediaGallery/></Suspense>;
}
