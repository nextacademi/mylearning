"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { motion, useAnimationFrame, useReducedMotion } from "framer-motion";
import { sampleGlyphPoints, seededRandom } from "./textGlyphPoints";

// Matches LogoReveal's full-screen particle count — the wordmark needs
// this many points at the hero's larger container size to read as clean
// letterforms rather than a speckled blob. Smaller icons (below) offset
// the extra render cost.
const MAX_PARTICLES = 360;

// One loop: settle as the wordmark -> burst apart -> re-form as a rotating
// 3D sphere of tiny people -> hold & spin -> burst apart -> re-form as the
// wordmark again. Sphere-dominant (longer hold) with a brief pass through
// the wordmark — the opposite emphasis of LogoReveal (where the wordmark
// IS the payoff) — so this reads as its own ambient "orbiting" mark rather
// than a repeat of the intro. Tuned for a snappier overall pace: shorter
// transitions and a shorter sphere hold than the original cut.
const PHASE_MS = { text: 1200, toSphere: 450, sphere: 1900, toText: 450 };
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
  const moving = phase === "toSphere" || phase === "toText";
  // No per-particle `filter` animation — animating blur() on ~360 elements
  // at once was heavy enough to visibly lag on slower devices, which read
  // as sluggish/janky rather than "premium." Plain position/opacity moves
  // instead, which Framer Motion (and the browser compositor) handle for
  // free.
  const target = resolving
    ? { x: sphereX, y: sphereY, z: sphereZ, opacity, scale: 1 }
    : { x: textX, y: textY, z: 0, opacity, scale: 1 };
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
      transition={{ duration: moving ? 0.4 : 0.6, delay: moving ? delayFrac * 0.08 : 0, ease: EASE }}
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
  const rotationResetRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [fontFamily, setFontFamily] = useState("sans-serif");
  const [phase, setPhase] = useState("sphere");
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
    tick("sphere");
    return () => { cancelled = true; clearTimeout(timer); };
  }, [reducedMotion]);

  // The continuous sphere spin leaves rotationRef at an arbitrary angle
  // whenever the hold ends — anywhere in 0-360deg+ per lap. Left alone,
  // the flat wordmark (toText/text/toSphere) would keep whatever angle
  // the sphere last had, which is a mirrored view of the text any time
  // that angle lands past 90/270deg. So as soon as "toText" starts, ease
  // rotationRef back to the nearest multiple of 360 (visually identical
  // to 0deg) in sync with the particles collapsing flat, so the wordmark
  // is always front-on and readable by the time "text" is reached.
  useEffect(() => {
    if (phase !== "toText") return undefined;
    rotationResetRef.current = {
      from: rotationRef.current,
      to: Math.round(rotationRef.current / 360) * 360,
      elapsed: 0,
    };
    return () => { rotationResetRef.current = null; };
  }, [phase]);

  // Manual, continuously-incrementing rotateY (no React re-render, no
  // Framer Motion `repeat` loop boundary to snap back at) — only while
  // resting as a sphere and actually on screen.
  useAnimationFrame((_, delta) => {
    if (!groupRef.current) return;
    if (phase === "sphere" && inViewRef.current && !reducedMotion) {
      rotationRef.current += delta * 0.055;
    } else if (rotationResetRef.current) {
      const reset = rotationResetRef.current;
      reset.elapsed += delta;
      const t = Math.min(reset.elapsed / PHASE_MS.toText, 1);
      const eased = 1 - (1 - t) ** 3;
      rotationRef.current = reset.from + (reset.to - reset.from) * eased;
      if (t >= 1) rotationResetRef.current = null;
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
      // A spectrum of the site's own red tones (bright/deep/soft) instead
      // of the old flat red+steel-gray mix — ties the crowd's palette to
      // the rest of the brand (matches RED_BRIGHT/RED_DEEP/the Eyebrow's
      // light-red in components/PublicSite.js) rather than an arbitrary
      // accent color. Majority still follows the letter's actual color
      // (58%) so the wordmark reads as clean letterforms, not a blob.
      const roll = rand();
      const color = roll < 0.16 ? "#F04438" : roll < 0.3 ? "#B91C1C" : roll < 0.42 ? "#FCA5A5" : point.word.color;
      return {
        textX: point.x - centerX,
        textY: point.y - centerY,
        sphereX: spherePoints[i].x,
        sphereY: spherePoints[i].y,
        sphereZ: spherePoints[i].z,
        color,
        opacity: 0.75 + rand() * 0.25,
        delayFrac: rand(),
        iconSize: 9 + rand() * 4,
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
      {!reducedMotion && (
        <>
          <motion.div
            className="pointer-events-none absolute inset-[12%] -z-10 rounded-full bg-[#ff2d2d]/25 blur-3xl"
            animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.92, 1.05, 0.92] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Two slow-spinning dashed orbit rings (opposite directions,
              offset sizes) — a cheap, single-element-each decorative
              accent that reads as "tech/orbit" framing around the crowd
              without touching any of the 360 individual particles. */}
          <motion.div
            className="pointer-events-none absolute inset-[6%] -z-10 rounded-full border border-dashed border-[#F04438]/25"
            animate={{ rotate: 360 }}
            transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="pointer-events-none absolute inset-[-2%] -z-10 rounded-full border border-dashed border-white/10"
            animate={{ rotate: -360 }}
            transition={{ duration: 26, repeat: Infinity, ease: "linear" }}
          />
        </>
      )}
      {/* Gentle continuous zoom in/out "breathing" — a separate wrapper
          from groupRef, since groupRef's own transform is written directly
          every frame by the rAF rotation loop below; animating scale on
          the SAME element would fight that and get overwritten. */}
      <motion.div
        className="absolute inset-0"
        animate={reducedMotion ? {} : { scale: [1, 1.07, 1] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div ref={groupRef} className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
          {particles.map((p, i) => (
            <SpherePartial key={i} {...p} phase={phase} />
          ))}
        </div>
      </motion.div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
