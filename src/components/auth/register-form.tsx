"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export function RegisterForm() {
  const params = useSearchParams();
  const invitationId = params.get("invitationId") ?? "";
  const proof = params.get("proof") ?? "";
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  if (!invitationId || !proof) return <p role="alert">Registration is invitation-only. Open the link sent to your email.</p>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/v1/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invitationId, proof, name, password }) });
      if (!response.ok) { setMessage("Registration failed or invitation expired. Contact the company owner or sign in if you already have an account."); return; }
      setComplete(true);
    } catch { setMessage("Registration failed. Please try again."); }
    finally { setLoading(false); }
  }
  const loginPath = `/login?next=${encodeURIComponent(`/accept-invitation?id=${invitationId}`)}`;
  if (complete) return <div><p>Check your inbox for a verification email. After verifying, sign in to accept your invitation.</p><Link className="underline" href={loginPath}>Sign in and accept invitation</Link></div>;
  return <form className="space-y-4" onSubmit={submit}>
    <p className="text-sm">Your invitation confirms the email address for this account.</p>
    <div><label htmlFor="name" className="block text-sm font-medium">Full name</label><input id="name" autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={e => setName(e.target.value)} className="w-full rounded border p-2" /></div>
    <div><label htmlFor="password" className="block text-sm font-medium">Password (12+ characters)</label><input id="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded border p-2" /></div>
    {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
    <button disabled={loading} type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50">{loading ? "Registering..." : "Register account"}</button>
    <p><Link href={loginPath} className="text-sm underline">Already registered? Sign in</Link></p>
  </form>;
}
