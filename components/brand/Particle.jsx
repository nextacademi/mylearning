"use client";

import { motion } from "framer-motion";

// One typographic particle — a small rectangle that flies in from a random
// offset (originX/originY, relative to its own resting point) and settles at
// its resting (x, y), losing blur/rotation as it arrives. Resting position is
// plain CSS top/left (cheap, no re-layout once set); the fly-in itself is a
// GPU-only transform (x/y/scale/rotate/filter), which is what actually moves.
// When `reduced` (prefers-reduced-motion, or the parent says not to animate)
// it just fades in in place — no motion, no blur.
export default function Particle({ x, y, originX, originY, color, delay, duration, rotate, size }) {
  return (
    <motion.span
      aria-hidden="true"
      className="absolute rounded-[1px] will-change-transform"
      style={{ left: x, top: y, width: size.w, height: size.h, backgroundColor: color }}
      initial={{ x: originX - x, y: originY - y, opacity: 0, scale: 0.4, rotate, filter: "blur(6px)" }}
      animate={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0, filter: "blur(0px)" }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
    />
  );
}
