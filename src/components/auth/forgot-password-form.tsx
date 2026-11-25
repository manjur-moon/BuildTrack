"use client";
import { FormEvent, useState } from "react";
import { authClient } from "@/lib/auth-client";
export function ForgotPasswordForm(){
 const [email,setEmail]=useState("");const [message,setMessage]=useState("");const [pending,setPending]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setPending(true);try{
   await authClient.requestPasswordReset({email,redirectTo:`${window.location.origin}/reset-password`});
   setMessage("If an account exists, a reset email has been sent.");
 }catch{setMessage("If an account exists, a reset email has been sent.");}finally{setPending(false);}}
 return <form className="space-y-4" onSubmit={submit}><label className="block" htmlFor="email">Email</label><input type="email" className="w-full rounded border p-2" id="email" value={email} required onChange={e=>setEmail(e.target.value)}/><button disabled={pending} className="rounded bg-neutral-900 px-4 py-2 text-white">Request password reset</button>{message&&<p role="status">{message}</p>}</form>;
}
