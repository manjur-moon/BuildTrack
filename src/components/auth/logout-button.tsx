"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
export function LogoutButton() {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  return <button className="rounded border px-4 py-2" disabled={busy} onClick={async () => {
    setBusy(true);
    try { await authClient.signOut(); router.replace("/login"); router.refresh(); }
    finally { setBusy(false); }
  }}>Sign out</button>;
}
