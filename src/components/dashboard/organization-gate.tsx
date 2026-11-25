import { OrganizationPicker, type OrganizationChoice } from "./organization-picker";
import { ThemeSwitcher } from "./theme-switcher";
import { BtIcon } from "./icons";
import Link from "next/link";

export function OrganizationGate({ organizations, userName }: {
  organizations: readonly OrganizationChoice[];
  userName: string;
}) {
  return <div className="bt-app bt-gate">
    <header className="bt-gate-header"><Link href="/" className="bt-gate-brand">BUILD<span>TRACK</span></Link><ThemeSwitcher/></header>
    <main className="bt-gate-card">
      <div className="bt-eyebrow"><BtIcon name="shield" size={16}/> SECURE WORKSPACE</div>
      <h1>Choose your<br/><em>workspace.</em></h1>
      <p>Welcome, {userName}. Select an active organization to continue. Access is verified against your membership.</p>
      {organizations.length ? <OrganizationPicker organizations={organizations} label="Your organization"/> :
        <div className="bt-empty-state"><strong>No active organization membership</strong><p>Ask your company owner to invite you, then verify your email and accept the invitation.</p></div>}
      <Link className="bt-back-link" href="/account"><BtIcon name="arrow-left" size={16}/> Account settings</Link>
    </main>
  </div>;
}
