"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { HERO_VIDEO_DEFAULTS, HERO_VIDEO_TIMING } from "../../lib/hero-video";
import { DEFAULT_COURSES } from "../../lib/training-offer";
import { resolvePhoto } from "../../lib/public-assets";

// Homepage hero "video" as a live slideshow, edited in Dashboard → Website
// → Hero video: logo intro → photo slides with captions → course list (from
// Website → Courses) → end card. Looks like the intro video, but every
// photo and line of text comes from the admin settings. Text is real page
// text, sized to the box (container query units), so it reads well on any
// screen. Pauses while off-screen; no zoom/slide motion for visitors who
// prefer reduced motion.
const EASE = [0.16, 1, 0.3, 1];
const size = (min, cqw, max) => ({ fontSize: `clamp(${min}px, ${cqw}cqw, ${max}px)` });

// Local photos resolve to their bundled /_next/static/media URL; uploaded
// ones (https://) are used as they are. Not via /_next/image: Firebase App
// Hosting answers that route with a 404, which left every slide black.
const photoSrc = (photo) => resolvePhoto(photo);

function buildScenes(config, courses) {
  const scenes = [];
  if (config.intro?.show !== false) scenes.push({ type: "intro", seconds: HERO_VIDEO_TIMING.intro });
  (config.slides || []).forEach((slide, i) => scenes.push({ type: "slide", slide, seconds: HERO_VIDEO_TIMING.slide, move: i % 3 }));
  if (config.courses?.show !== false && courses.length) scenes.push({ type: "courses", seconds: HERO_VIDEO_TIMING.courses });
  if (config.end?.show !== false) scenes.push({ type: "end", seconds: HERO_VIDEO_TIMING.end });
  return scenes;
}

function Logo({ className = "", style }) {
  return (
    <span className={`relative block overflow-hidden rounded-full bg-white shadow-[0_10px_40px_rgba(0,0,0,0.45)] ${className}`} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.jpeg" alt="Next Academy" className="h-full w-full object-cover" />
    </span>
  );
}

function Bar({ reduce }) {
  return (
    <motion.span
      className="block h-[3px] w-[7cqw] min-w-8 rounded-sm bg-[#E53935]"
      initial={reduce ? { opacity: 0 } : { x: "-140%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: EASE }}
    />
  );
}

const slideIn = (reduce, delay = 0) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, x: -28 },
  animate: { opacity: 1, x: 0 },
  transition: { duration: 0.6, delay, ease: EASE },
});

function SceneText({ scene, config, courses, reduce, displayClassName }) {
  if (scene.type === "intro") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[3cqw]">
        <motion.div
          className="relative"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.12 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, ease: EASE }}
        >
          <Logo className="h-[32cqw] w-[32cqw]" />
          {!reduce && (
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
            >
              <motion.span
                className="absolute inset-y-[-20%] w-[30%] rotate-[20deg] bg-gradient-to-r from-transparent via-white/70 to-transparent"
                initial={{ left: "-40%" }}
                animate={{ left: "120%" }}
                transition={{ duration: 1.1, delay: 0.5, ease: "easeInOut" }}
              />
            </motion.span>
          )}
        </motion.div>
        {config.intro?.text && (
          <motion.p {...slideIn(true, 0.6)} className="font-bold uppercase tracking-[0.18em] text-[#FCA5A5]" style={size(11, 1.9, 15)}>
            {config.intro.text}
          </motion.p>
        )}
      </div>
    );
  }

  if (scene.type === "slide") {
    return (
      <div className="absolute inset-x-0 bottom-0 px-[7.5%] pb-[7%]">
        <Bar reduce={reduce} />
        {scene.slide.label && (
          <motion.p {...slideIn(reduce, 0.05)} className="mt-[1.4cqw] font-bold uppercase tracking-wide text-[#FCA5A5] [text-shadow:0_1px_8px_rgba(0,0,0,0.65)]" style={size(11, 2.1, 16)}>
            {scene.slide.label}
          </motion.p>
        )}
        <motion.p {...slideIn(reduce, 0.18)} className={`${displayClassName} mt-[0.6cqw] font-bold leading-tight text-white drop-shadow`} style={size(18, 4.6, 36)}>
          {scene.slide.caption}
        </motion.p>
      </div>
    );
  }

  if (scene.type === "courses") {
    return (
      <div className="absolute inset-0 flex flex-col justify-center px-[7.5%]">
        <Bar reduce={reduce} />
        {config.courses?.label && (
          <motion.p {...slideIn(reduce, 0.05)} className="mt-[1.4cqw] font-bold uppercase tracking-wide text-[#FCA5A5] [text-shadow:0_1px_8px_rgba(0,0,0,0.65)]" style={size(11, 2, 15)}>
            {config.courses.label}
          </motion.p>
        )}
        <ul className="mt-[1.6cqw] space-y-[0.9cqw]">
          {courses.slice(0, 6).map((course, i) => (
            <motion.li key={course.id || course.title} {...slideIn(reduce, 0.2 + i * 0.16)} className="font-bold leading-tight text-white" style={size(14, 3.5, 26)}>
              {course.title}
            </motion.li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="absolute inset-x-0 bottom-0 px-[7.5%] pb-[7%]">
      <motion.div {...slideIn(reduce, 0)}>
        <Logo className="mb-[2cqw] h-[11.5cqw] w-[11.5cqw]" />
      </motion.div>
      <Bar reduce={reduce} />
      {config.end?.heading && (
        <motion.p {...slideIn(reduce, 0.1)} className={`${displayClassName} mt-[1.4cqw] font-bold leading-tight text-white drop-shadow`} style={size(19, 5.2, 40)}>
          {config.end.heading}
        </motion.p>
      )}
      <motion.div {...slideIn(reduce, 0.3)} className="mt-[2cqw] flex flex-wrap items-center gap-[2.4cqw]">
        {config.end?.button && (
          <a href="#courses" className="rounded-md bg-[#E53935] px-[2.6cqw] py-[1.2cqw] font-bold text-white shadow-lg transition hover:bg-[#F04438]" style={size(13, 2.9, 20)}>
            {config.end.button}
          </a>
        )}
        {config.end?.website && <span className="text-white/90" style={size(12, 2.6, 18)}>{config.end.website}</span>}
      </motion.div>
    </div>
  );
}

function Background({ scene, config, introPhoto, active, reduce, priority }) {
  // The browser fetches the first photo straight away; the rest wait their
  // turn in the queue instead of competing with it.
  const fetchPriority = priority ? "high" : "low";
  if (scene.type === "intro") {
    return (
      <div className="absolute inset-0 overflow-hidden bg-[#0B0D10]">
        {introPhoto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc(introPhoto)}
            alt=""
            fetchPriority={fetchPriority}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ filter: "blur(2px) brightness(0.5) saturate(0.8)", transform: "scale(1.06)" }}
          />
        )}
        <div
          className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse at 50% 44%, rgba(185,28,28,${introPhoto ? 0.55 : 0.75}), rgba(11,13,16,${introPhoto ? 0.92 : 1}) 68%)` }}
        />
      </div>
    );
  }
  const photo = scene.type === "slide" ? scene.slide.photo : scene.type === "courses" ? config.courses?.photo : config.end?.photo;
  const origin = scene.type === "slide" ? ["50% 50%", "100% 50%", "75% 30%"][scene.move] : "50% 50%";
  const zoom = active && !reduce;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#0B0D10]">
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoSrc(photo)}
          alt=""
          decoding="async"
          fetchPriority={fetchPriority}
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            transformOrigin: origin,
            transform: `scale(${scene.type === "courses" ? 1.15 : zoom ? 1.1 : 1})`,
            transition: zoom ? `transform ${scene.seconds + HERO_VIDEO_TIMING.fade}s linear` : `transform 0s linear ${HERO_VIDEO_TIMING.fade}s`,
            filter: scene.type === "courses" ? "blur(8px) brightness(0.45) saturate(0.6)" : "contrast(1.05) saturate(1.1)",
          }}
        />
      )}
      {scene.type !== "courses" && (
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.15) 55%, transparent), linear-gradient(to right, rgba(0,0,0,0.45), transparent 60%)" }}
        />
      )}
    </div>
  );
}

export default function HeroSlideshow({ config, courses, className = "", displayClassName = "" }) {
  const reduce = useReducedMotion();
  const settings = config || HERO_VIDEO_DEFAULTS;
  const courseList = useMemo(() => (Array.isArray(courses) ? courses : DEFAULT_COURSES), [courses]);
  const scenes = useMemo(() => buildScenes(settings, courseList), [settings, courseList]);
  const [index, setIndex] = useState(0);
  const [tick, setTick] = useState(0);
  const [visible, setVisible] = useState(true);
  const rootRef = useRef(null);
  const remainingRef = useRef(0);
  const active = scenes.length ? Math.min(index, scenes.length - 1) : 0;
  const running = visible && scenes.length > 1;
  // The intro shows the first slide's photo behind the logo, so the very
  // first frame is a real picture (and the browser fetches it first).
  const introPhoto = settings.slides?.find((slide) => slide.photo)?.photo || "";

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.2 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Each scene gets its full time when it starts; scrolling away pauses it
  // and keeps whatever is left.
  useEffect(() => {
    remainingRef.current = (scenes[active]?.seconds || 3) * 1000;
  }, [active, tick, scenes]);

  useEffect(() => {
    if (!running) return undefined;
    const started = Date.now();
    const timer = setTimeout(() => {
      setIndex((value) => (value + 1) % scenes.length);
      setTick((value) => value + 1);
    }, Math.max(remainingRef.current, 0));
    return () => {
      clearTimeout(timer);
      remainingRef.current -= Date.now() - started;
    };
  }, [active, tick, running, scenes]);

  if (!scenes.length) return null;
  const scene = scenes[active];
  const firstPhotoScene = scenes.findIndex((item) => item.type === "intro" ? introPhoto : item.type === "slide");

  return (
    <div
      ref={rootRef}
      className={`relative overflow-hidden bg-[#0B0D10] ${className}`}
      style={{ containerType: "inline-size" }}
      role="region"
      aria-roledescription="carousel"
      aria-label="Next Academy in pictures"
    >
      {scenes.map((item, i) => (
        <div
          key={`${item.type}-${i}`}
          aria-hidden="true"
          className="absolute inset-0"
          style={{ opacity: i === active ? 1 : 0, transition: `opacity ${HERO_VIDEO_TIMING.fade}s ease-in-out` }}
        >
          <Background scene={item} config={settings} introPhoto={introPhoto} active={i === active} reduce={reduce} priority={i === firstPhotoScene} />
        </div>
      ))}
      <AnimatePresence initial={true}>
        <motion.div
          key={`${active}-${tick}`}
          className="absolute inset-0"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
        >
          <SceneText scene={scene} config={settings} courses={courseList} reduce={reduce} displayClassName={displayClassName} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
