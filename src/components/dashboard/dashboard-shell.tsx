"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import type { DashboardGroup } from "@/server/dashboard/navigation";
import { BtIcon } from "./icons";
import { OrganizationPicker, type OrganizationChoice } from "./organization-picker";
import { ThemeSwitcher } from "./theme-switcher";

const SIDEBAR_PREFERENCE_KEY = "buildtrack-sidebar-collapsed";
const SIDEBAR_PREFERENCE_EVENT = "buildtrack:sidebar-preference-changed";
let fallbackCollapsed = false;

function subscribeSidebarPreference(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SIDEBAR_PREFERENCE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SIDEBAR_PREFERENCE_EVENT, onChange);
  };
}

function getSidebarPreference() {
  try {
    const saved = window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY);
    return saved === null ? fallbackCollapsed : saved === "1";
  } catch {
    return fallbackCollapsed;
  }
}

function getServerSidebarPreference() {
  return false;
}

export function DashboardShell({ children, groups, organizations, activeOrganizationId, user, roleLabels }: {
  children: ReactNode;
  groups: readonly DashboardGroup[];
  organizations: readonly OrganizationChoice[];
  activeOrganizationId: string;
  user: { name: string; email: string };
  roleLabels: readonly string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  // Path-keyed state automatically closes the drawer after client-side navigation.
  const [mobileOpenAtPath, setMobileOpenAtPath] = useState<string | null>(null);
  const mobileOpen = mobileOpenAtPath === pathname;
  // This external-store subscription avoids SSR hydration mismatches and setState-in-effect.
  const collapsed = useSyncExternalStore(
    subscribeSidebarPreference,
    getSidebarPreference,
    getServerSidebarPreference,
  );
  const [signingOut, setSigningOut] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const opener = openButtonRef.current;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setMobileOpenAtPath(null); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), select:not([disabled])'
      ) ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); opener?.focus(); };
  }, [mobileOpen]);

  function toggleCollapsed() {
    const next = !collapsed;
    fallbackCollapsed = next;
    try {
      window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, next ? "1" : "0");
    } catch { /* storage is optional; keep the in-memory preference */ }
    window.dispatchEvent(new Event(SIDEBAR_PREFERENCE_EVENT));
  }
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true); setSignOutError("");
    try {
      const response = await authClient.signOut();
      if (response.error) throw new Error("Sign out failed");
      router.replace("/login");
      router.refresh();
    } catch { setSignOutError("Unable to sign out. Try again."); setSigningOut(false); }
  }

  const activeLink = groups.flatMap((group) => group.items).find((item) => item.href === pathname);
  const initials = user.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "BT";

  const sidebar = <>
    <div className="bt-sidebar-heading">
      <Link className="bt-brand" href="/dashboard" onClick={() => setMobileOpenAtPath(null)} aria-label="BuildTrack dashboard home">
        <span className="bt-brand-mark" aria-hidden="true"><span/><span/><span/></span>
        <span className="bt-brand-name">BUILD<span>TRACK</span><small>CONSTRUCTION INTELLIGENCE</small></span>
      </Link>
      <button type="button" className="bt-icon-button bt-sidebar-collapse" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={toggleCollapsed}><BtIcon name="chevrons" size={18}/></button>
      <button ref={closeButtonRef} type="button" className="bt-icon-button bt-mobile-close" aria-label="Close navigation" onClick={() => setMobileOpenAtPath(null)}><BtIcon name="close"/></button>
    </div>
    <nav className="bt-side-nav" aria-label="Dashboard navigation">
      {groups.map((group) => <div className="bt-nav-group" key={group.label}>
        <p className="bt-nav-label">{group.label}</p>
        {group.items.map((item) => {
          const current = pathname === item.href;
          return <Link key={item.key} href={item.href} title={item.label} aria-current={current ? "page" : undefined}
            onClick={() => setMobileOpenAtPath(null)} className={`bt-nav-link${current ? " is-current" : ""}`}>
            <BtIcon name={item.icon} size={19}/><span className="bt-nav-item-label">{item.label}</span>
            {current && <span className="bt-current-line" aria-hidden="true"/>}
          </Link>;
        })}
      </div>)}
    </nav>
    <div className="bt-sidebar-foot">
      <div className="bt-workspace-stamp"><BtIcon name="shield" size={18}/><span>SECURE WORKSPACE<small>Organization-scoped access</small></span></div>
      {signOutError && <p className="bt-inline-error" role="alert">{signOutError}</p>}
      <button type="button" className="bt-sidebar-signout" onClick={() => void signOut()} disabled={signingOut}>
        <BtIcon name="log-out" size={18}/><span>{signingOut ? "Signing out…" : "Sign out"}</span>
      </button>
    </div>
  </>;

  return <div className={`bt-app bt-dashboard${collapsed ? " is-collapsed" : ""}`}>
    <a href="#dashboard-main" className="bt-skip-link">Skip to main content</a>
    {mobileOpen && <button type="button" className="bt-mobile-backdrop" aria-label="Close mobile navigation" onClick={() => setMobileOpenAtPath(null)}/>}
    <aside ref={sidebarRef} className={`bt-sidebar${mobileOpen ? " is-open" : ""}`} role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen ? true : undefined} aria-label="Primary navigation">{sidebar}</aside>
    <div className="bt-workarea">
      <header className="bt-topbar">
        <div className="bt-topbar-start">
          <button ref={openButtonRef} type="button" className="bt-icon-button bt-open-menu" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpenAtPath(pathname)}><BtIcon name="menu" size={20}/></button>
          <div className="bt-breadcrumb"><span>WORKSPACE</span><span aria-hidden="true">/</span><strong>{activeLink?.label ?? "Overview"}</strong></div>
        </div>
        <div className="bt-topbar-actions">
          <div className="bt-topbar-org"><OrganizationPicker organizations={organizations} activeId={activeOrganizationId} label="Company"/></div>
          <ThemeSwitcher compact/>
          <div className="bt-user-chip" title={user.email} aria-label={`Signed in as ${user.name}`}>
            <span className="bt-avatar">{initials}</span><span className="bt-user-name">{user.name}</span>
          </div>
        </div>
      </header>
      <main id="dashboard-main" className="bt-content" tabIndex={-1}>
        <div className="bt-page-meta"><span>BUILDTRACK / CONTROL CENTER</span><span>{roleLabels.join(" · ")}</span></div>
        {children}
      </main>
      <footer className="bt-work-footer"><span>© BuildTrack</span><span>Built for better builds.</span></footer>
    </div>
  </div>;
}
