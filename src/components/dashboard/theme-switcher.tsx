"use client";
import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { BtIcon } from "./icons";

// The server cannot know the browser's saved theme. Hydrate without an effect.
const subscribeHydration = () => () => {};
const getClientHydration = () => true;
const getServerHydration = () => false;

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeHydration,
    getClientHydration,
    getServerHydration,
  );
  return <label className="bt-theme-control">
    <BtIcon name="sun" size={17} />
    {!compact && <span className="bt-theme-caption">Theme</span>}
    <select aria-label="Color theme" value={mounted ? theme ?? "system" : "system"} disabled={!mounted}
      onChange={(e) => setTheme(e.target.value)}>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      <option value="system">System</option>
    </select>
  </label>;
}
