"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Space_Grotesk } from "next/font/google";

// Same config as PublicSite.js's displayFont — Next.js dedupes identical
// next/font/google configs at build time, so this doesn't load the font
// twice; it just lets this component style its wordmark without importing
// the whole page file.
const displayFont = Space_Grotesk({ subsets: ["latin"], weight: ["700"] });

// Real campus footage instead of an abstract graphic. object-contain (not
// object-cover) shows the whole frame with no cropping — the letterbox
// area behind it is solid black (no AI background-removal tool available
// to key out the video's own background, so this is the explicit fallback
// instead). Keeps the same news-lower-third "Next Academy" reveal used on
// the other hero variants, so this still carries the one branded
// "highlight" beat.
export default function HeroVideo({ className = "" }) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <video
        className="h-full w-full object-contain"
        src="/hero-video.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      />

      {!reduceMotion && (
        <motion.div
          className="absolute inset-x-0 bottom-4 flex justify-center"
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: [0, 0, 1, 1, 0], x: [28, 28, 0, 0, 28] }}
          transition={{ duration: 8, times: [0, 0.5, 0.6, 0.85, 0.95], repeat: Infinity, ease: "easeOut" }}
        >
          <div
            className="flex items-center gap-2.5 rounded-md border-l-4 px-3 py-1.5 backdrop-blur-sm"
            style={{ borderColor: "#F04438", background: "rgba(11,13,16,0.55)" }}
          >
            <span className={`${displayFont.className} text-sm font-bold uppercase tracking-[.14em] text-white md:text-base`}>
              Next <span style={{ color: "#F04438" }}>Academy</span>
            </span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
