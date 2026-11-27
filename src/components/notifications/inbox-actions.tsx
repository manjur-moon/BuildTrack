"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InboxMutation } from "@/server/notifications/input";

export function InboxAction({ input, label }: { input: InboxMutation; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  async function run() {
    if (busy || pending) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/v1/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store" });
      if (!response.ok) throw new Error("Action could not be completed. Refresh and try again.");
      const payload = await response.json() as { data: { changed: number } };
      if (input.action === "refresh") setMessage(payload.data.changed ? `${payload.data.changed} new alert(s).` : "No new alerts.");
      else setMessage("Inbox updated.");
      startTransition(() => router.refresh());
    } catch { setMessage("Action failed. Refresh to check the current state."); }
    finally { setBusy(false); }
  }
  return <div className="bt-inbox-action"><button type="button" disabled={busy || pending} onClick={run}>{busy || pending ? "Updating…" : label}</button><span role="status">{message}</span></div>;
}
