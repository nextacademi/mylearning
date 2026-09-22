"use client";

import { useEffect } from "react";
import Lenis from "lenis";

// Home page only (mounted from PublicSite.js) — the dashboard's own
// scroll containers (tables, chat panes, etc.) stay native, so this never
// touches anything past the public landing page. Renders nothing; it just
// swaps the browser's native scroll for Lenis's eased/inertia scroll for
// as long as it's mounted.
export default function SmoothScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => 1 - Math.pow(1 - t, 3),
      smoothWheel: true,
    });

    let frame;
    function raf(time) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    }
    frame = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return null;
}
