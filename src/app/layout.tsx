import type { Metadata } from "next";
import { BuildTrackThemeProvider } from "@/components/dashboard/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "BuildTrack | Construction Project Intelligence",
  description: "BuildTrack construction management platform — foundation setup.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><BuildTrackThemeProvider>{children}</BuildTrackThemeProvider></body>
    </html>
  );
}
