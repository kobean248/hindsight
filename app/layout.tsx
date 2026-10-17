import type { Metadata } from "next";
import { NavBar } from "@/components/nav-bar";
import { DataSourceBanner } from "@/components/data-source-banner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agent Ledger",
  description: "Shared lessons for AI agents, ranked by verified outcomes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <NavBar />
        <DataSourceBanner />
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
