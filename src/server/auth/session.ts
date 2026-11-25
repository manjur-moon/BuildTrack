import { headers } from "next/headers";
import { auth } from "./auth";
import { prisma } from "@/server/db/client";

export async function getOptionalSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function getActiveOrganizationMembership() {
  const session = await getOptionalSession();
  if (!session || !session.user.emailVerified) return null;
  const membership = await prisma.member.findFirst({
    where: { userId: session.user.id, disabledAt: null },
    select: { id: true, organizationId: true, role: true, organization: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return membership ? { session, membership } : null;
}
