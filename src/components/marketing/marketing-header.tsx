"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const links = [
  { href: "#platform", label: "The platform" },
  { href: "#workflows", label: "Workflows" },
  { href: "#approach", label: "Our approach" },
  { href: "#faq", label: "FAQ" },
  { href: "#contact", label: "Contact" },
];

export function MarketingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!menuOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [menuOpen]);

  return (
    <header className="bt-home-header">
      <div className="bt-home-header-inner">
        <Link href="/" className="bt-home-brand" aria-label="BuildTrack, home" onClick={() => setMenuOpen(false)}>
          <span className="bt-home-brand-mark" aria-hidden="true"><i/><i/><i/><i/></span>
          <span className="bt-home-brand-copy"><strong>BUILDTRACK</strong><small>CONSTRUCTION INTELLIGENCE</small></span>
        </Link>

        <nav className="bt-home-desktop-nav" aria-label="Primary navigation">
          {links.map((link) => <a href={link.href} key={link.href}>{link.label}</a>)}
        </nav>

        <div className="bt-home-header-actions">
          <label className="bt-home-theme">
            <span className="bt-home-visually-hidden">Color theme</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="12" r="3.7"/><path d="M12 1.5v2m0 17v2M1.5 12h2m17 0h2M4.6 4.6 6 6m12 12 1.4 1.4M19.4 4.6 18 6M6 18l-1.4 1.4"/></svg>
            <select aria-label="Color theme" value={hydrated ? theme ?? "system" : "system"} disabled={!hydrated} onChange={(event) => setTheme(event.target.value)}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </label>
          <Link className="bt-home-signin" href="/login">Sign in</Link>
          <Link className="bt-home-nav-cta" href="/dashboard">Workspace <span aria-hidden="true">↗</span></Link>
          <button className="bt-home-menu-toggle" type="button" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen} aria-controls="bt-home-mobile-nav" onClick={() => setMenuOpen((current) => !current)}>
            <span/><span/>
          </button>
        </div>
      </div>
      <nav id="bt-home-mobile-nav" className={`bt-home-mobile-nav${menuOpen ? " is-open" : ""}`} aria-label="Mobile navigation" aria-hidden={!menuOpen}>
        {links.map((link, index) => <a href={link.href} key={link.href} tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)}><span>0{index + 1}</span>{link.label}<span aria-hidden="true">↗</span></a>)}
        <div className="bt-home-mobile-actions">
          <Link href="/login" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)}>Sign in</Link>
          <Link href="/dashboard" tabIndex={menuOpen ? 0 : -1} onClick={() => setMenuOpen(false)}>Open workspace ↗</Link>
        </div>
      </nav>
    </header>
  );
}
