"use client";

import { motion, useReducedMotion } from "framer-motion";

// Replaces the earlier particle-sphere hero graphic with the site's own
// visual: a handful of large, blurred, brand-red blobs drifting and
// breathing independently (mix-blend-screen so overlaps brighten like
// light instead of muddying into brown), instead of a bounded "object".
// Faster/larger swings than a typical ambient background (~7-9s loops,
// wide travel) so the motion actually reads at a glance, plus a bright
// pulsing core at the center — the "highlight beat" — timed with the
// ShimmerText on "Next Academy" above it for a single cohesive moment.
// No canvas/WebGL — just Framer Motion looping transforms — so it stays
// cheap on mobile and never competes with the hero text for attention.
const BLOBS = [
  { color: "#F04438", size: 260, top: "6%", left: "8%", dur: 7, delay: 0 },
  { color: "#E53935", size: 230, top: "42%", left: "42%", dur: 8.5, delay: 0.5 },
  { color: "#B91C1C", size: 210, top: "54%", left: "2%", dur: 7.5, delay: 0.25 },
  { color: "#FCA5A5", size: 170, top: "8%", left: "52%", dur: 9, delay: 0.9 },
];

export default function HeroGradientMesh({ className = "" }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={`relative overflow-visible ${className}`} aria-hidden="true">
      {BLOBS.map((blob, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full mix-blend-screen"
          style={{
            width: blob.size,
            height: blob.size,
            top: blob.top,
            left: blob.left,
            background: `radial-gradient(circle at 35% 35%, ${blob.color}, transparent 70%)`,
            filter: "blur(46px)",
            opacity: 0.85,
          }}
          animate={
            reduceMotion
              ? undefined
              : { x: [0, 42, -30, 0], y: [0, -48, 28, 0], scale: [1, 1.2, 0.88, 1] }
          }
          transition={{ duration: blob.dur, delay: blob.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      {!reduceMotion && (
        <motion.div
          className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(255,255,255,0.95), rgba(240,68,56,0.45) 55%, transparent 75%)",
            filter: "blur(3px)",
          }}
          animate={{ scale: [1, 1.7, 1], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06), transparent 60%)" }}
      />
    </div>
  );
}
