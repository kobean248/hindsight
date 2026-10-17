import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppChrome } from "@/components/app-chrome";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "Agent Ledger | Shared lessons for AI agents",
  description:
    "A shared memory layer for AI agents. Lessons from failed runs, ranked by evaluator-verified outcomes, never by an agent's own “done”.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-screen">
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
