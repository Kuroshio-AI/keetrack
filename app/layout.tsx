import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { IS_FLS } from "@/lib/client";
import "./globals.css";

// Self-hosted so every device renders the same typeface instead of a local fallback.
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex" });

export const metadata: Metadata = {
  title: IS_FLS ? "KTrack · FLS Certificate Tracker" : "KTrack · Operations Console",
  description: IS_FLS ? "KTrack (Kuroshio Track): a local-first FLS DCD certificate tracker demo." : "KTrack (Kuroshio Track): a local-first Kee Safety operations demo.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={plex.variable}><body>{children}</body></html>;
}
