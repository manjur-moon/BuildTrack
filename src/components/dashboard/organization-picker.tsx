"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { BtIcon } from "./icons";

export type OrganizationChoice = { id: string; name: string; slug: string; membershipRole: string };

export function OrganizationPicker({ organizations, activeId, label = "Organization" }: {
  organizations: readonly OrganizationChoice[];
  activeId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function onChange(organizationId: string) {
    if (busy || organizationId === activeId) return;
    setBusy(true); setError("");
    try {
      const result = await authClient.organization.setActive({ organizationId });
      if (result.error) throw new Error("Unable to switch organization.");
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to select organization. Please sign in again if the issue persists.");
    } finally { setBusy(false); }
  }
  return <div className="bt-org-picker">
    <label className="bt-field-label" htmlFor="bt-active-org">{label}</label>
    <div className="bt-org-select-wrap"><BtIcon name="building" size={18}/>
      <select id="bt-active-org" aria-label="Active organization" disabled={busy || organizations.length === 0}
        value={activeId ?? ""} onChange={(e) => void onChange(e.target.value)}>
        {!activeId && <option value="" disabled>Select an organization</option>}
        {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
      </select>
    </div>
    {error && <p role="alert" className="bt-inline-error">{error}</p>}
  </div>;
}
