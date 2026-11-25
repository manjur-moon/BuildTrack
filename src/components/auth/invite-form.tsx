"use client";
import { FormEvent, useState } from "react";
export function InviteForm() {
  const [email,setEmail]=useState(""); const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  async function send(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setMessage("");
    try { const response=await fetch("/api/v1/auth/invitations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,role:"member"})});
      setMessage(response.ok?"Invitation requested. Check your configured SMTP inbox for delivery.":"Could not issue invitation. Confirm the account and email service configuration.");
      if(response.ok)setEmail("");
    } catch {setMessage("Network error. Please try again.");}
    finally {setBusy(false);}
  }
  return <form className="mt-8 space-y-3 border-t pt-6" onSubmit={send}><h2 className="text-lg font-semibold">Invite a team member (temporary)</h2><p className="text-sm">New users receive a basic member role. The five business roles are implemented in Step 6.</p>
    <label htmlFor="invite-email" className="block text-sm">Invitee email</label><input className="w-full rounded border p-2" type="email" id="invite-email" required value={email} onChange={e=>setEmail(e.target.value)} />
    <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white" disabled={busy}>{busy?"Inviting...":"Send invitation"}</button>
    {message&&<p role="status">{message}</p>}
  </form>;
}
