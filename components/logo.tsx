import Link from "next/link";

/** Ledger mark: stacked rows with one verified (green) line. */
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" stroke="currentColor" strokeOpacity="0.55" />
      <path d="M7 8h10" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 12h6" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />
      <path d="m7 16.2 2 2 4.2-4.4" stroke="#00b97e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2 font-semibold tracking-tight text-text">
      <span className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
        <LogoMark />
      </span>
      Agent Ledger
    </Link>
  );
}
