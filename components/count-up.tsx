"use client";

import { useEffect, useRef, useState } from "react";

/** Counts from 0 to `to` once, easing out. Renders the final value immediately under reduced motion. */
export function CountUp({
  to,
  format,
  duration = 1100,
}: {
  to: number;
  format: (n: number) => string;
  duration?: number;
}) {
  const [v, setV] = useState(to);
  const first = useRef(true);
  const from = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(to);
      return;
    }
    const start = performance.now();
    const origin = first.current ? 0 : from.current;
    first.current = false;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      const cur = origin + (to - origin) * eased;
      from.current = cur;
      setV(cur);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);

  return <span className="tabular-nums">{format(v)}</span>;
}
