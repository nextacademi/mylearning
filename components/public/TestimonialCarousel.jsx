"use client";

import { useState } from "react";

// Single-quote dark carousel — restyles the existing 3 testimonials (same
// quotes/names/photos already on the page, just presented one-at-a-time
// instead of a static 3-up grid) to match the reference site's layout.
export default function TestimonialCarousel({ items }) {
  const [index, setIndex] = useState(0);
  const current = items[index];

  function go(delta) {
    setIndex((current) => (current + delta + items.length) % items.length);
  }

  return (
    <div className="mx-auto max-w-3xl text-center">
      <div className="flex items-center justify-center gap-6 sm:gap-10">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous testimonial"
          className="hidden shrink-0 text-2xl text-white/40 transition hover:text-white sm:block"
        >
          ‹
        </button>
        <blockquote className="text-xl font-bold leading-snug text-white sm:text-2xl md:text-3xl">
          &ldquo;{current.quote}&rdquo;
        </blockquote>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next testimonial"
          className="hidden shrink-0 text-2xl text-white/40 transition hover:text-white sm:block"
        >
          ›
        </button>
      </div>

      <div className="mt-8 flex items-center justify-center gap-3">
        <img src={current.avatar} alt={current.name} className="h-11 w-11 rounded-full object-cover" />
        <div className="text-left">
          <b className="block text-sm text-white">{current.name}</b>
          <span className="block text-xs text-white/50">{current.role}</span>
        </div>
      </div>

      <div className="mt-6 flex justify-center gap-2">
        {items.map((item, i) => (
          <button
            key={item.name}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Show testimonial from ${item.name}`}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-[#E53935]" : "w-1.5 bg-white/25"}`}
          />
        ))}
      </div>

      <div className="mt-5 flex justify-center gap-6 sm:hidden">
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
