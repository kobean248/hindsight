"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { DataSourceBanner } from "@/components/data-source-banner";
import { NavBar } from "@/components/nav-bar";

/**
 * The landing page (`/`) brings its own header and footer. Every other route
 * is the app, wrapped in the dashboard nav bar and content column.
 */
export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // One delegated listener feeds the cursor spotlight on every `.spot` card.
  useEffect(() => {
    const on = (e: PointerEvent) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(".spot");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    window.addEventListener("pointermove", on, { passive: true });
    return () => window.removeEventListener("pointermove", on);
  }, []);

  if (pathname === "/") return <>{children}</>;
  return (
    <>
      <NavBar />
      <DataSourceBanner />
      <main className="relative mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="page-glow" />
        <div className="fade-up">{children}</div>
      </main>
    </>
  );
}
