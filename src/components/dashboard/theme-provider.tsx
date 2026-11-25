"use client";
import type { ReactNode } from "react";
import { ThemeProvider } from "next-themes";
export function BuildTrackThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="buildtrack-ui-theme">{children}</ThemeProvider>;
}
