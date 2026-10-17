"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Steps 0..count-1 on a timer, then holds on the last step briefly and loops.
 * Only ticks while the element is on screen and `paused` is false, so the demos
 * cost nothing off-screen. Honors prefers-reduced-motion by sitting on the end state.
 */
export function useLoop(count: number, intervalMs: number, paused: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver((e) => setInView(e.some((x) => x.isIntersecting)), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (reduced) {
      setStep(count - 1);
      return;
    }
    if (!inView || paused) return;
    // Hold the final frame for two extra beats before restarting.
    const id = setInterval(() => setStep((s) => (s >= count + 1 ? 0 : s + 1)), intervalMs);
    return () => clearInterval(id);
  }, [count, intervalMs, inView, paused, reduced]);

  return { ref, step: Math.min(step, count - 1) };
}
