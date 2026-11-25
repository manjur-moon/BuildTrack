import { Suspense } from "react";
import { AcceptInvitation } from "@/components/auth/accept-invitation";
export default function AcceptInvitationPage() {
  return <main className="mx-auto max-w-lg p-8 md:p-16"><h1 className="my-7 text-3xl font-semibold">Accept company invitation</h1><Suspense fallback={<p>Loading invitation...</p>}><AcceptInvitation/></Suspense></main>;
}
