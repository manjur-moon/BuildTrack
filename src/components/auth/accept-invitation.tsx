"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export function AcceptInvitation() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  async function accept() {
    if (!id) return;
    setLoading(true); setMessage("");
    try {
      const result = await authClient.organization.acceptInvitation({ invitationId: id });
      if (result.error) { setMessage("Please sign in with your verified invited email, then try again. This invitation may have expired."); return; }
      setDone(true);
    } catch { setMessage("Unable to accept the invitation. Please try again."); }
    finally { setLoading(false); }
  }
  if (!id) return <p role="alert">The invitation link is missing an ID.</p>;
  if (done) return <p>Invitation accepted. <Link className="underline" href="/account">Continue to account</Link></p>;
  return <div className="space-y-4"><p>Sign in with the email address that received the invitation and verify the email before accepting.</p>
    <button disabled={loading} onClick={accept} className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50">{loading ? "Accepting..." : "Accept invitation"}</button>
    {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
    <p><Link className="underline" href="/login">Sign in first</Link></p></div>;
}
