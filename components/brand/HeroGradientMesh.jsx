"use client";

import { motion, useReducedMotion } from "framer-motion";

// Replaces the earlier particle-sphere hero graphic with the site's own
// visual: a handful of large, blurred, brand-red blobs drifting and
// breathing independently (mix-blend-screen so overlaps brighten like
// light instead of muddying into brown), instead of a bounded "object".
// No canvas/WebGL — just Framer Motion looping transforms — so it stays
// cheap on mobile and never competes with the hero text for attention.
const BLOBS = [
  { color: "#F04438", size: 260, top: "6%", left: "8%", dur: 15, delay: 0 },
  { color: "#E53935", size: 230, top: "42%", left: "42%", dur: 19, delay: 1.4 },
  { color: "#B91C1C", size: 210, top: "54%", left: "2%", dur: 17, delay: 0.7 },
  { color: "#FCA5A5", size: 170, top: "8%", left: "52%", dur: 21, delay: 2.2 },
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
            opacity: 0.8,
          }}
          animate={
            reduceMotion
              ? undefined
              : { x: [0, 26, -18, 0], y: [0, -32, 18, 0], scale: [1, 1.12, 0.94, 1] }
          }
          transition={{ duration: blob.dur, delay: blob.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06), transparent 60%)" }}
      />
    </div>
  );
}
