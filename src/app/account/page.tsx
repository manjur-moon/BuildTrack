import Link from "next/link";
import { redirect } from "next/navigation";
import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/server/db/client";
import { LogoutButton } from "@/components/auth/logout-button";
import { InviteForm } from "@/components/auth/invite-form";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const session = await getOptionalSession();
  if (!session) redirect("/login");
  const memberships = await prisma.member.findMany({ where:{userId:session.user.id,disabledAt:null}, select:{organizationId:true,role:true,organization:{select:{name:true}}} });
  const isOwner = memberships.some((member)=>member.role==="owner");
  return <main className="mx-auto max-w-xl space-y-4 p-8 md:p-16"><p className="text-sm">BuildTrack · Authentication review</p><h1 className="text-3xl font-semibold">Account</h1>
    <p>Signed in as {session.user.name} ({session.user.email}).</p><p>Email verified: {session.user.emailVerified?"Yes":"No"}</p>
    <h2 className="text-lg font-semibold">Company memberships</h2>
    {memberships.length?<ul className="list-inside list-disc">{memberships.map((m)=><li key={m.organizationId}>{m.organization.name} — {m.role}</li>)}</ul>:<p>No active company membership yet. Accept the invitation after verifying your email.</p>}
    {isOwner&&<InviteForm/>}<LogoutButton/>
    <Link className="block text-sm underline" href="/">Back to placeholder home</Link>
  </main>;
}
