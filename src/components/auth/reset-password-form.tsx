"use client";
import { FormEvent,useState } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import Link from "next/link";
export function ResetPasswordForm(){
 const token=useSearchParams().get("token")??"";const [password,setPassword]=useState("");const [message,setMessage]=useState("");const [pending,setPending]=useState(false);
 if(!token)return <p>Invalid or expired password reset link.</p>;
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setPending(true);
 try{const result=await authClient.resetPassword({token,newPassword:password});setMessage(result.error?"Link expired or password invalid.":"Password updated. You can sign in.");}
 catch{setMessage("Reset unsuccessful.");}finally{setPending(false);}}
 return <form className="space-y-4" onSubmit={submit}><label htmlFor="password" className="block">New password (12+ characters)</label><input id="password" className="w-full rounded border p-2" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)}/><button disabled={pending} className="rounded bg-neutral-900 px-4 py-2 text-white">Save new password</button>{message&&<p role="status">{message}</p>}<Link href="/login" className="block underline">Sign in</Link></form>;
}
