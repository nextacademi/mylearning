"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationFrame, useReducedMotion } from "framer-motion";
import { sampleGlyphPoints, seededRandom } from "./textGlyphPoints";

// Lighter cap than the full-screen LogoReveal's ParticleText (360) — this
// one runs continuously in a hero corner rather than once, so it needs to
// stay cheap indefinitely, not just for a few seconds.
const MAX_PARTICLES = 200;

// One loop: settle as the wordmark -> burst apart -> re-form as a rotating
// 3D sphere of tiny people -> hold & spin -> burst apart -> re-form as the
// wordmark again. Deliberately sphere-dominant (long hold) with only a
// brief pass through the wordmark — the opposite emphasis of LogoReveal
// (where the wordmark IS the payoff) — so this reads as its own ambient
// "orbiting" mark rather than a repeat of the intro.
const PHASE_MS = { text: 900, toSphere: 950, sphere: 7200, toText: 950 };
const NEXT_PHASE = { text: "toSphere", toSphere: "sphere", sphere: "toText", toText: "text" };
const EASE = [0.22, 1, 0.36, 1];

// Evenly distributes `count` points across a sphere's surface (no pole
// clustering, unlike naive lat/long sampling) — the same construction used
// for things like geodesic domes and Thomson-problem approximations.
function fibonacciSpherePoints(count, radius) {
  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    points.push({ x: Math.cos(theta) * r * radius, y: y * radius, z: Math.sin(theta) * r * radius });
  }
  return points;
}

// A minimal filled person-silhouette (head + shoulders) — reads clearly
// even at ~10px, unlike a multi-stroke icon. `currentColor` so the wrapper
// span's `color` drives it (lets the motion element handle position/
// opacity/blur while the SVG just handles the shape).
function PersonGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="100%" height="100%" aria-hidden="true">
      <circle cx="8" cy="4.6" r="3" fill="currentColor" />
      <path d="M1.5 16c0-4.42 2.91-7.5 6.5-7.5s6.5 3.08 6.5 7.5" fill="currentColor" />
    </svg>
  );
}

function SpherePartial({ textX, textY, sphereX, sphereY, sphereZ, color, opacity, iconSize, delayFrac, phase }) {
  const resolving = phase === "sphere" || phase === "toSphere";
  const target = resolving
    ? { x: sphereX, y: sphereY, z: sphereZ, opacity, scale: 1, filter: "blur(0px)" }
    : { x: textX, y: textY, z: 0, opacity, scale: 1, filter: "blur(0px)" };
  const moving = phase === "toSphere" || phase === "toText";
  return (
    <motion.span
      className="absolute left-1/2 top-1/2 will-change-transform"
      style={{ width: iconSize, height: iconSize, color, marginLeft: -iconSize / 2, marginTop: -iconSize / 2 }}
      // `initial={false}` — the crowd should be there the instant the page
      // is, not fly in from scattered points on first load. This only
      // affects the very first paint; every later phase change still
      // animates normally via the `animate` prop below.
      initial={false}
      animate={target}
      transition={{ duration: moving ? 0.75 : 0.7, delay: moving ? delayFrac * 0.2 : 0, ease: EASE }}
    >
      <PersonGlyph />
    </motion.span>
  );
}

// A looping hero decoration — a crowd of tiny people, built from the exact
// same "person" motif as the dot-cloud graphic it replaces — that settles
// as the "NEXT ACADEMY" wordmark, periodically bursts apart, and re-forms
// into a slowly spinning 3D sphere of people before reassembling back into
// the wordmark. Pure CSS 3D transforms (perspective + preserve-3d +
// per-particle translateZ) driven by Framer Motion — no Three.js. The
// continuous sphere spin is done via useAnimationFrame writing straight to
// the DOM (not React state), so it never re-renders React and pauses for
// free whenever the tab is backgrounded; it's also paused via
// IntersectionObserver whenever this scrolls out of view, since this loops
// forever unlike the one-shot LogoReveal.
export default function HeroParticleSphere({ words, className = "" }) {
  const containerRef = useRef(null);
  const groupRef = useRef(null);
  const inViewRef = useRef(true);
  const rotationRef = useRef(0);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [fontFamily, setFontFamily] = useState("sans-serif");
  const [phase, setPhase] = useState("text");
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

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([entry]) => { inViewRef.current = entry.isIntersecting; }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The phase state machine. Each tick just waits for the current phase's
  // duration and advances — if the component is currently scrolled out of
  // view it re-checks shortly instead of advancing, so a returning visitor
  // never finds it mid-explosion.
  useEffect(() => {
    if (reducedMotion) return undefined;
    let cancelled = false;
    let timer = null;
    function tick(current) {
      timer = setTimeout(() => {
        if (cancelled) return;
        if (!inViewRef.current) { tick(current); return; }
        const next = NEXT_PHASE[current];
        setPhase(next);
        tick(next);
      }, PHASE_MS[current]);
    }
    tick("text");
    return () => { cancelled = true; clearTimeout(timer); };
  }, [reducedMotion]);

  // Manual, continuously-incrementing rotateY (no React re-render, no
  // Framer Motion `repeat` loop boundary to snap back at) — only while
  // resting as a sphere and actually on screen.
  useAnimationFrame((_, delta) => {
    if (!groupRef.current) return;
    if (phase === "sphere" && inViewRef.current && !reducedMotion) {
      rotationRef.current += delta * 0.018;
    }
    groupRef.current.style.transform = `rotateY(${rotationRef.current}deg)`;
  });

  const label = words.map((w) => w.text).join(" ");

  const particles = useMemo(() => {
    if (typeof window === "undefined" || !size.width || !size.height) return [];
    const rand = seededRandom(11 + size.width);
    const { points, centerX, centerY } = sampleGlyphPoints({
      width: size.width,
      height: size.height,
      words,
      fontWeight: 800,
      fontFamily,
      maxPoints: MAX_PARTICLES,
      stacked: true,
    });
    const count = points.length;
    const sphereRadius = Math.min(size.width, size.height) * 0.36;
    const spherePoints = fibonacciSpherePoints(count, sphereRadius);
    return points.map((point, i) => {
      // A warmer, more red-forward mix than LogoReveal's crisp white
      // wordmark, plus a dimmer "gray" third tone for depth variety —
      // matching the layered look of the crowd/sphere reference stills —
      // part of giving this its own distinct palette/mood.
      const roll = rand();
      const color = roll < 0.4 ? "#ff3b3b" : roll < 0.58 ? "#9aa0a6" : point.word.color;
      return {
        textX: point.x - centerX,
        textY: point.y - centerY,
        sphereX: spherePoints[i].x,
        sphereY: spherePoints[i].y,
        sphereZ: spherePoints[i].z,
        color,
        opacity: 0.75 + rand() * 0.25,
        delayFrac: rand(),
        iconSize: 13 + rand() * 8,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height, fontFamily, label]);

  if (reducedMotion) {
    return (
      <div ref={containerRef} className={`relative flex aspect-square items-center justify-center ${className}`}>
        <p className="text-center text-2xl font-black leading-[1.15] tracking-tight sm:text-3xl">
          {words.map((w, i) => (
            <span key={i} className="block" style={{ color: w.color }}>
              {w.text}
            </span>
          ))}
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative aspect-square ${className}`} style={{ perspective: 1000 }} aria-hidden="true">
      <div ref={groupRef} className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
        {particles.map((p, i) => (
          <SpherePartial key={i} {...p} phase={phase} />
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
