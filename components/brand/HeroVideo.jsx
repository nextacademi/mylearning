"use client";

import heroVideoSrc from "../../public/hero-intro.mp4";

// Homepage hero video. public/hero-intro.mp4 is a short intro: the logo
// with a light shine, then the academy's own class photos (slow camera
// moves, soft dissolves, sliding captions): practical skills,
// real trainers, learning by doing, the course list, and a
// "Join our next batch · Register now · nextacademy.sg" end card. Rebuild it
// when the course list changes. object-contain shows the whole 16:9 frame.
export default function HeroVideo({ className = "" }) {
  return (
    <div className={`relative overflow-hidden bg-black ${className}`}>
      <video
        className="h-full w-full object-contain"
        src={heroVideoSrc}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Next Academy: practical training with real trainers. Courses: Basic Computer Course, Advance Excel, Basic AutoCAD, AI Learning and WPLN Preparatory. Register at nextacademy.sg."
      />
    </div>
  );
}
