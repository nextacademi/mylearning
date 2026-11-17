"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

// Single-quote dark carousel — restyles the existing 3 testimonials (same
// quotes/names/photos already on the page, just presented one-at-a-time
// instead of a static 3-up grid) to match the reference site's layout.
// Plays on its own every few seconds (pauses while hovered or focused, and
// for visitors who prefer reduced motion); arrows and dots still work.
const AUTOPLAY_MS = 6000;

export default function TestimonialCarousel({ items }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const current = items[index];

  useEffect(() => {
    if (paused || reduceMotion || items.length < 2) return undefined;
    // Restarts after every change, so a click also gets a full turn.
    const timer = setTimeout(() => setIndex((value) => (value + 1) % items.length), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [index, paused, reduceMotion, items.length]);

  function go(delta) {
    setIndex((value) => (value + delta + items.length) % items.length);
  }

  return (
    <div
      className="mx-auto max-w-3xl text-center"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="What our learners say"
    >
      <div className="flex items-center justify-center gap-6 sm:gap-10">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous testimonial"
          className="hidden shrink-0 text-2xl text-white/40 transition hover:text-white sm:block"
        >
          ‹
        </button>
        <div className="grid min-h-[6.5rem] flex-1 place-items-center sm:min-h-[7.5rem]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <blockquote className="text-xl font-bold leading-snug text-white sm:text-2xl md:text-3xl" aria-live="polite">
                &ldquo;{current.quote}&rdquo;
              </blockquote>
              <div className="mt-6 flex items-center justify-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={current.avatar} alt={current.name} className="h-11 w-11 rounded-full object-cover" />
                <div className="text-left">
                  <b className="block text-sm text-white">{current.name}</b>
                  <span className="block text-xs text-white/50">{current.role}</span>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next testimonial"
          className="hidden shrink-0 text-2xl text-white/40 transition hover:text-white sm:block"
        >
          ›
        </button>
      </div>

      <div className="mt-5 flex justify-center gap-2">
        {items.map((item, i) => (
          <button
            key={item.name}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show testimonial from ${item.name}`}
            aria-current={i === index}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-[#E53935]" : "w-1.5 bg-white/25 hover:bg-white/50"}`}
          />
        ))}
      </div>

      <div className="mt-4 flex justify-center gap-6 sm:hidden">
        <button type="button" onClick={() => go(-1)} aria-label="Previous testimonial" className="text-xl text-white/40">
          ‹
        </button>
        <button type="button" onClick={() => go(1)} aria-label="Next testimonial" className="text-xl text-white/40">
          ›
        </button>
      </div>
    </div>
  );
}
