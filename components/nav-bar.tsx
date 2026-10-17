"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/lessons", label: "Lessons" },
  { href: "/runs", label: "Runs" },
];

export function NavBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-[60px] max-w-6xl items-center gap-4 px-4 sm:gap-8 sm:px-6">
        <Logo />
        <ul className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative block rounded-md px-3 py-2 transition-colors ${
                    active ? "text-text" : "text-muted hover:text-text"
                  }`}
                >
                  {l.label}
                  <span
                    className={`absolute inset-x-3 -bottom-[13px] h-px bg-accent transition-opacity duration-300 ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
        <Link href="/" className="btn btn-ghost btn-sm ml-auto">
          Home
        </Link>
      </nav>
    </header>
  );
}
