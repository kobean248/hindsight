"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";

const NAV = [
  { href: "#why", label: "Why" },
  { href: "#loop", label: "How it works" },
  { href: "#integrations", label: "Integrations" },
  { href: "#pilot", label: "Pilot data" },
  { href: "#faq", label: "FAQ" },
];

export function LandingHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 h-[65px] border-b backdrop-blur-xl transition-colors duration-300 ${
        scrolled || open ? "border-border bg-bg/85" : "border-transparent bg-bg/0"
      }`}
    >
      <div className="mx-auto grid h-full max-w-[1160px] grid-cols-[1fr_auto] items-center px-5 md:grid-cols-[1fr_auto_1fr]">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-md px-3 py-2 text-[15px] text-muted transition-colors hover:text-text">
              {n.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center justify-end gap-2">
          <Link href="/lessons" className="btn btn-ghost btn-sm hidden sm:inline-flex">
            Lessons
          </Link>
          <Link href="/dashboard" className="btn btn-primary btn-sm">
            Open dashboard
          </Link>
          <button
            type="button"
            className="btn btn-ghost btn-sm md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label="Toggle menu"
            onClick={() => setOpen((o) => !o)}
          >
            <span className="relative block h-3 w-4">
              <span className={`absolute left-0 h-px w-4 bg-current transition-all duration-300 ${open ? "top-1.5 rotate-45" : "top-0"}`} />
              <span className={`absolute left-0 top-1.5 h-px w-4 bg-current transition-opacity duration-200 ${open ? "opacity-0" : "opacity-100"}`} />
              <span className={`absolute left-0 h-px w-4 bg-current transition-all duration-300 ${open ? "top-1.5 -rotate-45" : "top-3"}`} />
            </span>
          </button>
        </div>
      </div>
      <nav
        id="mobile-nav"
        aria-label="Mobile"
        className={`fixed inset-x-0 top-[65px] bottom-0 overflow-y-auto bg-bg px-5 transition-[opacity,transform] duration-300 md:hidden ${
          open ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
        }`}
      >
        {NAV.map((n) => (
          <a
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className="block border-b border-border py-[18px] text-base"
          >
            {n.label}
          </a>
        ))}
        <Link href="/lessons" onClick={() => setOpen(false)} className="block border-b border-border py-[18px] text-base">
          Lessons
        </Link>
      </nav>
    </header>
  );
}
