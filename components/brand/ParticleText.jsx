"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import Particle from "./Particle";

// Cap on rendered particles — "thousands" flying across the screen would
// mean thousands of animated DOM nodes, which is not lightweight on a real
// phone. A few hundred, sampled evenly across the text's actual glyph
// shapes and staggered with randomized timing/blur, reads as a dense swarm
// while staying smooth (every particle only ever animates x/y/scale/rotate/
// filter — transform-only, no layout thrash).
const MAX_PARTICLES = 360;

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Lays each word out left-to-right, centered as a whole block, and returns
// the x-range (in canvas coordinates) each word occupies — so every sampled
// particle point can be colored by which word it actually belongs to,
// rather than guessing from a fixed split ratio.
function layoutWords(ctx, words, fontSize, fontWeight, fontFamily) {
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const gap = fontSize * 0.32;
  const widths = words.map((w) => ctx.measureText(w.text).width);
  const totalWidth = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
  let cursor = -totalWidth / 2;
  const segments = words.map((w, i) => {
    const seg = { ...w, width: widths[i], startX: cursor, endX: cursor + widths[i] };
    cursor += widths[i] + gap;
    return seg;
  });
  return { segments, totalWidth };
}

function sampleTextPoints({ width, height, words, fontWeight, fontFamily, accentColor, accentRatio, rand }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];

  // Auto-fit: start from the container height, shrink if the laid-out text
  // would overflow the available width.
  let fontSize = Math.max(20, height * 0.72);
  let layout = layoutWords(ctx, words, fontSize, fontWeight, fontFamily);
  const maxWidth = width * 0.94;
  if (layout.totalWidth > maxWidth) {
    fontSize = Math.max(14, fontSize * (maxWidth / layout.totalWidth));
    layout = layoutWords(ctx, words, fontSize, fontWeight, fontFamily);
  }

  const centerX = width / 2;
  const centerY = height / 2;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  layout.segments.forEach((seg) => ctx.fillText(seg.text, centerX + seg.startX, centerY));

  const { data } = ctx.getImageData(0, 0, width, height);
  const step = Math.max(2, Math.round(Math.min(width, height) / 130));
  const points = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (data[(y * width + x) * 4 + 3] > 120) points.push({ x, y });
    }
  }

  // Downsample evenly across the shape (not just the first N) so every
  // letter stays represented even when there are far more candidate pixels
  // than the particle budget.
  let chosen = points;
  if (points.length > MAX_PARTICLES) {
    const stride = points.length / MAX_PARTICLES;
    chosen = Array.from({ length: MAX_PARTICLES }, (_, i) => points[Math.floor(i * stride)]);
  }

  return chosen.map((point) => {
    const relX = point.x - centerX;
    const word = layout.segments.find((seg) => relX >= seg.startX - 2 && relX <= seg.endX + 2) || layout.segments[layout.segments.length - 1];
    const isAccent = rand() < accentRatio;
    const angle = rand() * Math.PI * 2;
    const radius = 220 + rand() * 360;
    return {
      x: point.x,
      y: point.y,
      originX: point.x + Math.cos(angle) * radius,
      originY: point.y + Math.sin(angle) * radius,
      color: isAccent ? accentColor : word.color,
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
// hand-tuned layout. Falls back to a plain, motion-free heading under
// prefers-reduced-motion.
export default function ParticleText({ words, accentColor = "#ffffff", accentRatio = 0.08, fontWeight = 800, play = true, seed = 1, className = "" }) {
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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, fontFamily, label, fontWeight, seed, accentColor, accentRatio]);

  if (reducedMotion || !play) {
    return (
      <div ref={containerRef} className={`relative flex items-center justify-center ${className}`}>
        <p className="text-center font-extrabold leading-none" style={{ fontSize: "min(9vw, 64px)" }}>
          {words.map((w, i) => (
            <span key={i} style={{ color: w.color }}>
              {w.text}
              {i < words.length - 1 ? " " : ""}
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
