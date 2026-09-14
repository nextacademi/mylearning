"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import Particle from "./Particle";
import { sampleGlyphPoints, seededRandom } from "./textGlyphPoints";

// Cap on rendered particles — "thousands" flying across the screen would
// mean thousands of animated DOM nodes, which is not lightweight on a real
// phone. A few hundred, sampled evenly across the text's actual glyph
// shapes and staggered with randomized timing/blur, reads as a dense swarm
// while staying smooth (every particle only ever animates x/y/scale/rotate/
// filter — transform-only, no layout thrash).
const MAX_PARTICLES = 360;

function sampleTextPoints({ width, height, words, fontWeight, fontFamily, accentColor, accentRatio, rand, stacked }) {
  const { points } = sampleGlyphPoints({ width, height, words, fontWeight, fontFamily, maxPoints: MAX_PARTICLES, stacked });
  return points.map((point) => {
    const isAccent = rand() < accentRatio;
    const angle = rand() * Math.PI * 2;
    const radius = 220 + rand() * 360;
    return {
      x: point.x,
      y: point.y,
      originX: point.x + Math.cos(angle) * radius,
      originY: point.y + Math.sin(angle) * radius,
      color: isAccent ? accentColor : point.word.color,
      delay: 0.1 + rand() * 0.85,
      duration: 0.85 + rand() * 0.65,
      rotate: (rand() - 0.5) * 150,
      size: { w: 2 + rand() * 2, h: 6 + rand() * 9 },
    };
  });
}

// Renders `words` (each `{ text, color }`) as a swarm of small rectangular
// particles that fly in from random directions and settle into the actual
// glyph shapes — measured from a real canvas render of the text, not a
// hand-tuned layout. `stacked` puts each word on its own centered line
// instead of side-by-side — use it whenever the container is closer to
// square than wide, or the words would get crushed down fighting for
// width. Falls back to a plain, motion-free heading under
// prefers-reduced-motion.
export default function ParticleText({ words, accentColor = "#ffffff", accentRatio = 0.08, fontWeight = 800, play = true, seed = 1, stacked = false, className = "" }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Canvas's `font` property needs an actually-resolved font-family list — a
  // raw `var(--font-geist-sans)` reference is invalid CSS for a canvas
  // context (unlike a real stylesheet) and silently falls back to a tiny
  // default font, which was quietly shrinking the sampled text down to a
  // handful of particles. Read the real, already-resolved value once the
  // container is in the DOM (refs are only safe to read in an effect, not
  // during render).
  const [fontFamily, setFontFamily] = useState("sans-serif");
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    setFontFamily(getComputedStyle(el).fontFamily || "sans-serif");
    const measure = () => {
      const box = el.getBoundingClientRect();
      setSize({ width: Math.round(box.width), height: Math.round(box.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const label = words.map((w) => w.text).join(" ");

  const particles = useMemo(() => {
    if (typeof window === "undefined" || !size.width || !size.height) return [];
    const rand = seededRandom(seed + size.width);
    return sampleTextPoints({
      width: size.width,
      height: size.height,
      words,
      fontWeight,
      fontFamily,
      accentColor,
      accentRatio,
      rand,
      stacked,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, fontFamily, label, fontWeight, seed, accentColor, accentRatio, stacked]);

  if (reducedMotion || !play) {
    return (
      <div ref={containerRef} className={`relative flex items-center justify-center ${className}`}>
        <p className={`text-center font-extrabold ${stacked ? "leading-[1.15]" : "leading-none"}`} style={{ fontSize: "min(9vw, 64px)" }}>
          {words.map((w, i) => (
            <span key={i} className={stacked ? "block" : undefined} style={{ color: w.color }}>
              {w.text}
              {!stacked && i < words.length - 1 ? " " : ""}
            </span>
          ))}
        </p>
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {particles.map((p, i) => (
        <Particle key={i} {...p} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
