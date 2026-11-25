import type { ReactNode, SVGProps } from "react";
import type { DashboardIcon } from "@/server/dashboard/navigation";

const iconPaths: Record<DashboardIcon | "menu" | "close" | "chevrons" | "sun" | "moon" | "log-out" | "arrow-up-right" | "shield" | "arrow-left", ReactNode> = {
  layout: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-5h6v5M8 7h2m4 0h2M8 11h2m4 0h2"/></>,
  "hard-hat": <><path d="M4 16a8 8 0 0 1 16 0M3 16h18v3H3zM9 9v7m6-7v7"/></>,
  "check-square": <><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/></>,
  boxes: <><rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/></>,
  wallet: <><rect x="3" y="6" width="18" height="15" rx="2"/><path d="M3 10V6a3 3 0 0 1 3-3h12M16 15h5"/></>,
  chart: <><path d="M3 3v18h18M7 15l4-5 3 2 5-7"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 5a3 3 0 0 1 0 6M17 14a5 5 0 0 1 4 5"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  close: <path d="M5 5l14 14M19 5 5 19"/>,
  chevrons: <path d="m7 9 5-5 5 5M7 15l5 5 5-5"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.5 1.5m11.2 11.2 1.5 1.5M2 12h2m16 0h2M4.9 19.1l1.5-1.5M17.6 6.4l1.5-1.5"/></>,
  moon: <path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>,
  "log-out": <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></>,
  "arrow-up-right": <path d="M7 17 17 7M7 7h10v10"/>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  "arrow-left": <path d="m12 19-7-7 7-7M5 12h14"/>,
};

export function BtIcon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & {
  name: keyof typeof iconPaths;
  size?: number;
}) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{iconPaths[name]}</svg>;
}
