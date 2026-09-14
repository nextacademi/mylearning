"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useAuth } from "../lib/auth-context";
import { submitContactInquiry } from "../lib/contact-inquiries-data";
import { subscribePublishedEvents } from "../lib/public-events-data";
import { computeEventStatus, isRegistrationOpen } from "../lib/events-shared";
import TestimonialCarousel from "./public/TestimonialCarousel";
import PhotoGallery from "./public/PhotoGallery";
import VideoLibrarySection from "./public/VideoLibrarySection";
import PartnersSection from "./public/PartnersSection";
import CalendarSubscribeButton from "./events/CalendarSubscribeButton";
import { BRAND_WORDS } from "./brand/LogoReveal";
import HeroParticleSphere from "./brand/HeroParticleSphere";

// Landing-page-only color system (blood red + white/off-white + dark text,
// plus a near-black for the dark sections the 24asia.pages.dev-style
// redesign introduces). Kept local to this file (arbitrary Tailwind values)
// rather than in globals.css's shared --dash-* tokens, since those are
// explicitly scoped to dashboard surfaces — this keeps the redesign
// isolated to the public site with zero risk of bleeding into
// dashboard/admin/teacher/student UI.
const RED = "#E53935";
const RED_BRIGHT = "#F04438";
const RED_DEEP = "#B91C1C";
const RED_DARK = "#7F1D1D";
const INK = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const OFFWHITE = "#FAFAF7";
const DARK = "#0B0D10";

const image = (id, width = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;
const photos = {
  about: image("photo-1523580846011-d3a5bc25702b"),
  learner: image("photo-1494790108377-be9c29b29330", 480),
  mentor: image("photo-1500648767791-00dcc994a43e", 240),
  teacher: image("photo-1534528741775-53994a69daeb", 240),
};

// Real Next Academy training-session photos (public/tranning*.jpeg) — used
// only for these 4 landing-page program cards, matched by visual content
// since the files have no topic-specific names. Local paths only, no
// external image URLs.
const programs = [
  {
    category: "Leadership",
    title: "Lead with clarity",
    copy: "Build the judgment, communication, and confidence to move people forward.",
    src: "/tranning1.jpeg",
    accent: RED,
    stat: "5+ batches",
  },
  {
    category: "Teaching",
    title: "Teach for impact",
    copy: "Turn expertise into learning experiences that stay with people.",
    src: "/tranning3.jpeg",
    accent: RED_DEEP,
    stat: "Ongoing support",
  },
  {
    category: "Community",
    title: "Grow together",
    copy: "Create stronger communities through empathy, collaboration, and action.",
    src: "/tranning4.jpeg",
    accent: RED_DEEP,
    stat: "Year round",
  },
  {
    category: "Career",
    title: "Build what is next",
    copy: "Develop practical skills for a changing world of work.",
    src: "/tranning5.jpeg",
    accent: RED,
    stat: "Job-ready skills",
  },
];

// Real, unused local training photos, styled as the reference's uniform
// gallery grid — no stock/fabricated imagery.
const galleryItems = [
  {
    src: "/tranning2.jpeg",
    category: "Education",
    title: "Classroom Sessions",
  },
  {
    src: "/tranning18.jpeg",
    category: "Education",
    title: "Hands-on Training",
  },
  {
    src: "/tranning145.jpeg",
    category: "Community",
    title: "Group Activities",
  },
  { src: "/tranning195.jpeg", category: "Community", title: "Team Building" },
  {
    src: "/WhatsApp Image 2026-09-09 at 11.15.10 PM.jpeg",
    category: "Highlights",
    title: "Recent Moments",
  },
];

const MONTH_ABBR = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

// Formats a stored "YYYY-MM-DD" as "20 SEP 2026" via pure string math (never
// through `new Date()`), so a date is never shifted by a day due to
// timezone parsing — it always shows exactly what the dashboard saved.
function formatEventDate(isoDate) {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  return `${String(day).padStart(2, "0")} ${MONTH_ABBR[month - 1]} ${year}`;
}

// Formats a stored 24h "HH:MM" as "2:00 PM".
function formatEventTime(hhmm) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [hour, minute] = hhmm.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

const HOW_TO_HELP = [
  {
    number: "01",
    title: "Join a training batch",
    description:
      "Enroll in a live batch and learn alongside people building the same skills you are.",
  },
  { number: "02", title: "Share your knowledge" },
  { number: "03", title: "Volunteer with us" },
  { number: "04", title: "Support a learner" },
];

const TESTIMONIALS = [
  {
    avatar: photos.learner,
    name: "Mina S.",
    role: "Leadership graduate",
    quote:
      "The sessions gave me language for things I had felt but could not yet explain.",
  },
  {
    avatar: photos.mentor,
    name: "Dara K.",
    role: "Teacher participant",
    quote:
      "I left with tools I could use with my students the very next morning.",
  },
  {
    avatar: photos.teacher,
    name: "Sophea R.",
    role: "Community fellow",
    quote: "Next Academy feels ambitious and kind at the same time.",
  },
];

const ROLE_OPTIONS = [
  "Student",
  "Instructor",
  "Corporate Client",
  "Technical Support",
];
const TOPIC_OPTIONS = [
  "Course Enrollment",
  "Technical Issue",
  "Billing",
  "Partnership",
];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Brand({ light = false }) {
  return (
    <a
      href="#home"
      className={`flex items-center gap-2 text-base font-bold tracking-tight sm:text-lg ${light ? "text-white" : "text-[#111827]"}`}
    >
      <img
        src="/logo.jpeg"
        alt="Next Academy logo"
        className="h-8 w-8 rounded-[9px_9px_9px_2px] object-contain"
      />
      next
      <span className={light ? "-ml-2 text-white/90" : "-ml-2 text-[#E53935]"}>
        academy
      </span>
    </a>
  );
}

function Eyebrow({ children, className = "", light = false }) {
  return (
    <p
      className={`inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[.2em] ${light ? "text-[#FCA5A5]" : "text-[#E53935]"} ${className}`}
    >
      <span
        className={`h-[2px] w-6 ${light ? "bg-[#FCA5A5]" : "bg-[#E53935]"}`}
      />
      {children}
    </p>
  );
}

// Scroll-in-view reveal — fade + slight rise, staggered in groups of 4 by
// 70ms. Matches 24asia.pages.dev's own reveal recipe (same duration,
// easing curve, and stagger step), reused here for section heads, cards,
// and grids across the page. `whileInView` + `viewport.once` means each
// element animates in exactly once, the first time it's scrolled into
// view, then stays put — never replays on scroll-up.
const REVEAL_EASE = [0.22, 1, 0.36, 1];
function Reveal({ children, index = 0, className, as = "div", ...rest }) {
  // `motion.article` etc. — a plain tag name like "article" doesn't
  // understand Framer Motion's animation props on its own.
  const Component = typeof as === "string" ? motion[as] : as;
  return (
    <Component
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.65, delay: Math.min(index % 4, 3) * 0.07, ease: REVEAL_EASE }}
      {...rest}
    >
      {children}
    </Component>
  );
}

// Each number counts 0 -> value (rAF + easeOutCubic) once `active` flips
// true (an IntersectionObserver on the parent), and stays put — no
// hold/reset loop, since the hero isn't the place for a repeating animation
// competing with the dot-cloud graphic next to it.
function AnimatedCounter({ value, suffix = "", active, duration = 1800 }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const frameId = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(frameId);
    }
    let frameId = null;
    let cancelled = false;
    const startTime = performance.now();
    function tick(now) {
      if (cancelled) return;
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(eased * value));
      if (progress < 1) frameId = requestAnimationFrame(tick);
    }
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [active, value, duration]);

  return (
    <span
      className="tabular-nums inline-block"
      style={{ minWidth: `${String(value).length + suffix.length}ch` }}
    >
      {display}
      {suffix}
    </span>
  );
}

function HeroStatsRow({ items }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.3 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-white/10 pt-4 sm:grid-cols-4"
    >
      {items.map((stat, index) => (
        <div
          key={stat.label}
          className={`${index !== 0 ? "sm:border-l sm:border-white/10 sm:pl-6" : ""}`}
        >
          <strong className="block text-3xl font-black text-white">
            <AnimatedCounter
              value={stat.value}
              suffix={stat.suffix}
              active={visible}
            />
          </strong>
          <span className="mt-1 block text-xs font-medium text-white/50">
            {stat.label}
          </span>
        </div>
      ))}
    </div>
  );
}

const CONTACT_FORM_INITIAL = {
  name: "",
  email: "",
  role: ROLE_OPTIONS[0],
  topic: TOPIC_OPTIONS[0],
  message: "",
};

// Real, persistent submission — writes straight to Firestore's
// `contactInquiries` collection (see lib/contact-inquiries-data.js and
// firestore.rules) so the Director/Admin dashboard's Contact Inquiries
// page and its unread badge are backed by the same database, not a fake
// front-end-only success message.
function ContactForm() {
  const [values, setValues] = useState(CONTACT_FORM_INITIAL);
  const [fieldErrors, setFieldErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [feedback, setFeedback] = useState("");

  function setField(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function validate() {
    const errors = {};
    if (!values.name.trim()) errors.name = "Full name is required.";
    if (!values.email.trim()) errors.email = "Email address is required.";
    else if (!EMAIL_PATTERN.test(values.email.trim()))
      errors.email = "Enter a valid email address.";
    if (!values.message.trim()) errors.message = "Message is required.";
    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (status === "submitting") return; // prevent duplicate submissions
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setStatus("submitting");
    setFeedback("");
    try {
      await submitContactInquiry(values);
      setStatus("success");
      setFeedback(
        `Thank you, ${values.name.trim()}! Your message has been sent successfully.`,
      );
      setValues(CONTACT_FORM_INITIAL);
      setFieldErrors({});
    } catch {
      setStatus("error");
      setFeedback("Something went wrong. Please try again.");
      // Do NOT reset the form on failure — the visitor's message is kept.
    }
  }

  const inputClass = (hasError) =>
    `w-full rounded-lg border ${hasError ? "border-[#E53935]" : "border-[#E5E7EB]"} bg-white px-4 py-2.5 text-sm text-[#111827] outline-none transition focus:border-[#E53935] focus:ring-2 focus:ring-[#E53935]/20`;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm md:p-8"
    >
      {feedback && (
        <p
          role="status"
          className={`mb-5 rounded-lg px-4 py-3 text-sm font-medium ${status === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-[#B91C1C]"}`}
        >
          {feedback}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-[#374151]">
          Full Name *
          <input
            type="text"
            value={values.name}
            onChange={(event) => setField("name", event.target.value)}
            className={`mt-2 ${inputClass(fieldErrors.name)}`}
            placeholder="Your full name"
          />
          {fieldErrors.name && (
            <span className="mt-1 block text-xs text-[#E53935]">
              {fieldErrors.name}
            </span>
          )}
        </label>
        <label className="block text-sm font-semibold text-[#374151]">
          Email Address *
          <input
            type="email"
            value={values.email}
            onChange={(event) => setField("email", event.target.value)}
            className={`mt-2 ${inputClass(fieldErrors.email)}`}
            placeholder="you@example.com"
          />
          {fieldErrors.email && (
            <span className="mt-1 block text-xs text-[#E53935]">
              {fieldErrors.email}
            </span>
          )}
        </label>
        <label className="block text-sm font-semibold text-[#374151]">
          Role / User Type
          <select
            value={values.role}
            onChange={(event) => setField("role", event.target.value)}
            className={`mt-2 ${inputClass(false)}`}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-[#374151]">
          Inquiry Topic
          <select
            value={values.topic}
            onChange={(event) => setField("topic", event.target.value)}
            className={`mt-2 ${inputClass(false)}`}
          >
            {TOPIC_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-[#374151] sm:col-span-2">
          Message *
          <textarea
            value={values.message}
            onChange={(event) => setField("message", event.target.value)}
            rows={5}
            className={`mt-2 resize-none ${inputClass(fieldErrors.message)}`}
            placeholder="Tell us how we can help..."
          />
          {fieldErrors.message && (
            <span className="mt-1 block text-xs text-[#E53935]">
              {fieldErrors.message}
            </span>
          )}
        </label>
      </div>
      <button
        type="submit"
        disabled={status === "submitting"}
        className="mt-5 w-full rounded-full bg-[#E53935] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#F04438] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        {status === "submitting" ? "Sending..." : "Submit Inquiry"}
      </button>
    </form>
  );
}

export default function PublicSite() {
  const router = useRouter();
  const { user, profile, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [events, setEvents] = useState([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [helpIndex, setHelpIndex] = useState(0);
  const verifiedUser =
    user &&
    (user.emailVerified ||
      user.providerData?.some(
        (provider) => provider.providerId !== "password",
      ));

  function goToLearning() {
    router.push(
      verifiedUser && profile?.role
        ? `/dashboard/${profile.role.toLowerCase()}`
        : "/login",
    );
  }

  // Live feed of the SAME academyEvents the Director/Admin dashboard
  // manages — no separate public collection, no hardcoded sample data.
  // Firestore's own realtime listener is the update mechanism: publishing,
  // editing, unpublishing, or deleting an event in the dashboard pushes
  // straight through to this listener with no polling.
  useEffect(() => {
    return subscribePublishedEvents(
      (data) => {
        setEvents(data);
        setEventsLoaded(true);
      },
      () => setEventsLoaded(true),
    );
  }, []);

  const heroStats = [
    { label: "Students Trained", value: 40, suffix: "+" },
    { label: "Expert Teachers", value: 35, suffix: "+" },
    { label: "Courses Offered", value: 42, suffix: "+" },
    { label: "Total Enrollments", value: 38, suffix: "+" },
  ];

  const upcomingEvents = events
    .map((event) => ({ ...event, computedStatus: computeEventStatus(event) }))
    .filter(
      (event) =>
        event.computedStatus === "Upcoming" ||
        event.computedStatus === "Ongoing",
    )
    .sort(
      (a, b) =>
        (a.eventDate || "").localeCompare(b.eventDate || "") ||
        (a.startTime || "").localeCompare(b.startTime || ""),
    )
    .slice(0, 6);

  return (
      <main className="overflow-x-clip bg-white text-[#111827]">
        {/* NAVBAR — landing page only, dark per the reference theme */}
        <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0B0D10]/95 shadow-sm backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-10">
            <Brand light />
            <div
              className={`${menuOpen ? "absolute left-0 right-0 top-16 block border-t border-white/10 bg-[#0B0D10] px-5 py-5 shadow-lg" : "hidden"} md:static md:flex md:items-center md:gap-8 md:border-0 md:bg-transparent md:p-0`}
            >
              <a
                href="#home"
                className="block py-2 text-sm font-medium text-white/70 transition hover:text-white"
              >
                Home
              </a>
              <a
                href="#training"
                className="block py-2 text-sm font-medium text-white/70 transition hover:text-white"
              >
                Training
              </a>
              <a
                href="#events"
                className="block py-2 text-sm font-medium text-white/70 transition hover:text-white"
              >
                Events
              </a>
              <a
                href="#about"
                className="block py-2 text-sm font-medium text-white/70 transition hover:text-white"
              >
                About
              </a>
              <a
                href="#contact"
                className="block py-2 text-sm font-medium text-white/70 transition hover:text-white"
              >
                Contact
              </a>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {verifiedUser ? (
                <>
                  <button
                    onClick={goToLearning}
                    className="whitespace-nowrap rounded-full bg-[#E53935] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#F04438] sm:px-4 sm:py-2.5 sm:text-xs"
                  >
                    My Learning <span className="ml-1 sm:ml-2">↗</span>
                  </button>
                  <div className="relative">
                    <button
                      onClick={() => setProfileOpen(!profileOpen)}
                      className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-white/10 text-xs font-bold text-white"
                    >
                      {(profile?.displayName || user.email || "NA")
                        .slice(0, 2)
                        .toUpperCase()}
                    </button>
                    {profileOpen && (
                      <div className="absolute right-0 top-12 w-48 rounded-lg border border-[#E5E7EB] bg-white p-3 text-[#111827] shadow-xl">
                        <p className="border-b border-[#E5E7EB] pb-2 text-xs font-semibold">
                          {profile?.displayName || user.email}
                        </p>
                        <p className="py-2 text-[11px] text-[#6B7280]">
                          {profile?.role || "Student"}
                        </p>
                        <button
                          onClick={logout}
                          className="w-full rounded-md px-2 py-2 text-left text-xs text-[#B91C1C] hover:bg-red-50"
                        >
                          Log out
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <Link
                    href="/login"
                    className="hidden text-xs font-semibold text-white/70 hover:text-white sm:block"
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    className="whitespace-nowrap rounded-full bg-[#E53935] px-3 py-2 text-[11px] font-bold text-white transition hover:bg-[#F04438] sm:px-4 sm:py-2.5 sm:text-xs"
                  >
                    Join Us
                  </Link>
                </div>
              )}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="text-2xl text-white md:hidden"
                aria-label="Toggle navigation"
              >
                ☰
              </button>
            </div>
          </div>
          {menuOpen && !verifiedUser && (
            <div className="border-t border-white/10 bg-[#0B0D10] px-5 pb-5 md:hidden">
              <Link
                href="/login"
                className="block py-3 text-sm font-semibold text-white"
              >
                Login
              </Link>
            </div>
          )}
        </nav>

        {/* HERO — dark, 3-line headline, real stat row, dot-cloud graphic */}
        <section id="home" className="bg-[#0B0D10]">
          <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-5 md:grid-cols-[1.15fr_1fr] md:gap-10 md:px-10 md:py-7">
            <div>
              <Eyebrow light>Next Academy · Learning Platform</Eyebrow>

              <h1 className="mt-3 max-w-xl text-5xl font-black leading-[1.0] tracking-[-.03em] text-white md:text-5xl lg:text-6xl">
                Learn today.
                <br />
                Grow your career.
                <br />
                <span className="text-[#F04438]">Lead tomorrow.</span>
              </h1>

              <p className="mt-3 max-w-md text-base leading-6 text-white/60 md:text-lg">
                Next Academy trains real students with real teachers, across
                real courses and batches — practical skills that turn straight
                into better jobs and stronger careers.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href="#training"
                  className="rounded-full bg-white px-6 py-2.5 text-sm font-bold text-[#111827] transition hover:bg-white/90"
                >
                  Explore programs <span className="ml-3">→</span>
                </a>
                <button
                  onClick={goToLearning}
                  className="rounded-full border border-white/20 px-6 py-2.5 text-sm font-bold text-white transition hover:border-white/40"
                >
                  My Learning <span className="ml-3">↗</span>
                </button>
              </div>

              <HeroStatsRow items={heroStats} />
            </div>

            {/* Decorative only — hidden on mobile so the hero stays lean and
                text-first on small screens; shows from md: up where there's
                actually room for it to breathe. */}
            <div className="relative hidden justify-center md:flex md:justify-end">
              <div className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-[#ff2d2d]/20 blur-[100px]" />
              <HeroParticleSphere
                words={BRAND_WORDS}
                className="w-full max-w-[420px] lg:max-w-[480px]"
              />
            </div>
          </div>
        </section>

        {/* ABOUT */}
        <section
          id="about"
          className="mx-auto grid max-w-7xl gap-6 px-5 py-6 md:grid-cols-[.8fr_1.2fr] md:items-center md:gap-10 md:px-10 md:py-8"
        >
          <Reveal>
            <Eyebrow>About Next Academy</Eyebrow>
            <h2 className="mt-3 max-w-lg text-4xl font-black leading-[1.05] tracking-[-.03em] text-[#111827] md:text-5xl">
              Building skills that create real opportunities.
            </h2>
            <p className="mt-4 max-w-md text-base leading-7 text-[#6B7280]">
              We bring educators, practitioners, and changemakers together to
              make meaningful learning practical, human, and connected to the
              future people want to build.
            </p>
          </Reveal>
          <Reveal index={1} className="grid gap-5 md:grid-cols-[1.25fr_.75fr]">
            <div className="group relative min-h-[340px] overflow-hidden rounded-2xl">
              <img
                src={photos.about}
                alt="Learners collaborating in a bright classroom"
                className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
              />
              <div className="absolute bottom-5 left-5 rounded-lg bg-white/95 px-4 py-3 text-xs shadow-sm backdrop-blur">
                <b className="block text-[#111827]">Our mission</b>
                <span className="text-[#6B7280]">
                  Make learning useful from day one.
                </span>
              </div>
            </div>
            <div className="flex flex-col justify-end rounded-2xl bg-[#B91C1C] p-7 text-white">
              <span className="font-mono text-[10px] uppercase tracking-widest text-white/70">
                Our vision
              </span>
              <p className="mt-5 text-2xl font-bold leading-tight">
                A future where every learner can find their voice and strengthen
                the world around them.
              </p>
            </div>
          </Reveal>
        </section>

        {/* TRAINING / PROGRAMS — "What We Do" */}
        <section
          id="training"
          className="border-y border-[#E5E7EB] bg-[#FAFAF7]"
        >
          <div className="mx-auto max-w-6xl px-5 py-6 md:px-8 md:py-8">
            <Eyebrow>What we do</Eyebrow>
            <h2 className="mt-2 text-3xl font-black tracking-[-.03em] text-[#111827] md:text-4xl">
              Programs built around real needs.
            </h2>

            <div className="mt-4 grid gap-5 md:grid-cols-2">
              {programs.map((program, index) => (
                <Reveal
                  as="article"
                  index={index}
                  className="group overflow-hidden rounded-2xl border border-[#E5E7EB] border-t-4 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg"
                  style={{ borderTopColor: program.accent }}
                  key={program.title}
                >
                  <div className="h-52 overflow-hidden md:h-56">
                    <img
                      src={program.src}
                      alt={program.title}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-4">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#E53935]">
                      {program.category}
                    </p>
                    <h3 className="mt-1.5 text-xl font-black tracking-tight text-[#111827]">
                      {program.title}
                    </h3>
                    <p className="mt-1.5 max-w-md text-sm leading-5 text-[#6B7280]">
                      {program.copy}
                    </p>
                    <span className="mt-3 inline-block rounded-full bg-red-50 px-3 py-1 text-[11px] font-bold text-[#B91C1C]">
                      {program.stat}
                    </span>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* EVENTS */}
        <section
          id="events"
          className="mx-auto max-w-7xl px-5 py-6 md:px-10 md:py-8"
        >
          <Reveal className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Eyebrow>Event calendar</Eyebrow>
              <h2 className="mt-3 text-4xl font-black tracking-[-.03em] text-[#111827] md:text-5xl">
                Learn, connect and grow together.
              </h2>
            </div>
            <div className="flex items-center gap-4">
              <CalendarSubscribeButton />
              <a href="#contact" className="text-sm font-bold text-[#E53935]">
                View all events →
              </a>
            </div>
          </Reveal>
          {!eventsLoaded ? (
            <p className="mt-5 text-sm text-[#6B7280]">Loading events...</p>
          ) : !upcomingEvents.length ? (
            <p className="mt-5 text-sm text-[#6B7280]">
              No upcoming events at the moment.
            </p>
          ) : (
            <div className="mt-5 grid gap-6 md:grid-cols-3">
              {upcomingEvents.map((event, index) => {
                const day = event.eventDate
                  ? event.eventDate.slice(8, 10)
                  : null;
                const month = event.eventDate
                  ? MONTH_ABBR[Number(event.eventDate.slice(5, 7)) - 1]
                  : null;
                const fullDate = formatEventDate(event.eventDate);
                const startTime = formatEventTime(event.startTime);
                const endTime = formatEventTime(event.endTime);
                const timeRange = startTime
                  ? `${startTime}${endTime ? ` – ${endTime}` : ""}`
                  : null;
                const registrationOpen = isRegistrationOpen(event);

                return (
                  <Reveal
                    as="article"
                    index={index}
                    className="group overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg"
                    key={event.id}
                  >
                    {event.bannerUrl ? (
                      <div className="relative h-48 overflow-hidden">
                        <img
                          src={event.bannerUrl}
                          alt={event.name}
                          className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                        />
                        {day && (
                          <div className="absolute left-4 top-4 rounded-md bg-[#B91C1C] px-3 py-2 text-center text-white shadow-md">
                            <b className="block text-2xl leading-none">{day}</b>
                            <small className="font-mono text-[9px]">
                              {month}
                            </small>
                          </div>
                        )}
                      </div>
                    ) : (
                      fullDate && (
                        <p className="px-6 pt-6 font-mono text-xs font-bold text-[#B91C1C]">
                          {fullDate}
                        </p>
                      )
                    )}
                    <div className="p-6">
                      {event.type && (
                        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#B91C1C]">
                          {event.type}
                        </p>
                      )}
                      <h3 className="mt-1 text-xl font-black text-[#111827]">
                        {event.name}
                      </h3>
                      {(event.bannerUrl ? fullDate : null) ||
                      timeRange ||
                      event.location ? (
                        <p className="mt-2 text-xs text-[#6B7280]">
                          {[
                            event.bannerUrl ? fullDate : null,
                            timeRange,
                            event.location,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                      {event.description && (
                        <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#6B7280]">
                          {event.description}
                        </p>
                      )}
                      {registrationOpen && (
                        <span className="mt-3 inline-block text-xs font-bold text-[#111827]">
                          Registration open
                        </span>
                      )}
                    </div>
                  </Reveal>
                );
              })}
            </div>
          )}
        </section>

        {/* HOW TO HELP — first card expanded, others collapsed (accordion) */}
        <section className="border-y border-[#E5E7EB] bg-[#FAFAF7]">
          <div className="mx-auto max-w-7xl px-5 py-6 md:px-10 md:py-8">
            <Reveal>
              <Eyebrow>How to help</Eyebrow>
              <h2 className="mt-3 max-w-xl text-3xl font-black leading-[1.05] tracking-[-.03em] text-[#111827] md:text-4xl">
                Four ways to get involved.
              </h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-[#6B7280]">
                You don&apos;t need special skills or spare hours — you need the
                heart to show up. We&apos;ll handle the rest.
              </p>
            </Reveal>

            <div className="mt-5 grid gap-4 md:grid-cols-4">
              {HOW_TO_HELP.map((item, index) => {
                const expanded = helpIndex === index;
                return (
                  <Reveal
                    as="button"
                    index={index}
                    key={item.number}
                    type="button"
                    onClick={() => setHelpIndex(index)}
                    className={`rounded-2xl border p-6 text-left transition ${
                      expanded
                        ? "border-[#E53935] bg-white shadow-md md:col-span-2"
                        : "border-[#E5E7EB] bg-white hover:border-[#E53935]/40"
                    }`}
                  >
                    <span className="text-2xl font-black text-[#E53935]">
                      {item.number}
                    </span>
                    <h3 className="mt-3 text-base font-bold text-[#111827]">
                      {item.title}
                    </h3>
                    {expanded && item.description && (
                      <p className="mt-2 text-sm leading-6 text-[#6B7280]">
                        {item.description}
                      </p>
                    )}
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        {/* TESTIMONIALS — dark single-quote carousel */}
        <section className="bg-[#0B0D10] py-6 md:py-8">
          <Reveal as="div" className="mx-auto max-w-7xl px-5 md:px-10">
            <Eyebrow light className="justify-center">
              Why it matters
            </Eyebrow>
            <div className="mt-4">
              <TestimonialCarousel items={TESTIMONIALS} />
            </div>
          </Reveal>
        </section>

        {/* GALLERY */}
        <section className="mx-auto max-w-7xl px-5 py-6 md:px-10 md:py-8">
          <Reveal className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <Eyebrow>Activities / gallery</Eyebrow>
              <h2 className="mt-3 text-4xl font-black tracking-[-.03em] text-[#111827] md:text-5xl">
                Show up. Try things. Belong.
              </h2>
            </div>
            <p className="max-w-xs text-sm leading-6 text-[#6B7280]">
              Learning happens in classrooms, conversations, and all the moments
              between.
            </p>
          </Reveal>
          <Reveal index={1} className="mt-5">
            <PhotoGallery items={galleryItems} />
          </Reveal>
        </section>

        <VideoLibrarySection />

        <PartnersSection />

        {/* GRADIENT CTA BANNER */}
        <section className="mx-auto max-w-7xl px-5 py-6 md:px-10 md:py-8">
          <Reveal className="rounded-3xl bg-gradient-to-br from-[#E53935] to-[#F59E0B] px-6 py-7 text-center text-white md:px-16 md:py-9">
            <h2 className="mx-auto max-w-2xl text-3xl font-black leading-tight md:text-4xl">
              Your next skill is one enrollment away.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-white/90 md:text-base">
              Join a training batch, explore a new programme, or simply come
              along and see what we do.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/register"
                className="rounded-full bg-white px-6 py-3.5 text-sm font-bold text-[#B91C1C] transition hover:bg-white/90"
              >
                Join as a Learner
              </Link>
              <a
                href="#contact"
                className="rounded-full border border-white/40 px-6 py-3.5 text-sm font-bold text-white transition hover:border-white"
              >
                Talk to Someone First
              </a>
            </div>
          </Reveal>
        </section>

        {/* CONTACT FORM */}
        <section id="contact" className="bg-[#FAFAF7]">
          <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 md:grid-cols-[.9fr_1.1fr] md:gap-8 md:px-7 md:py-7">
            <Reveal>
              <Eyebrow>Get in touch</Eyebrow>

              <h2 className="mt-3 max-w-lg text-3xl font-bold leading-[1.08] tracking-[-0.04em] text-[#111827] md:text-4xl">
                Have a question? Send us a message.
              </h2>

              <p className="mt-3 max-w-md text-sm leading-6 text-[#6B7280]">
                Whether you&apos;re exploring a program, need support, or want
                to partner with us — our team will get back to you.
              </p>

              <div className="mt-3 space-y-2 text-sm text-[#374151]">
                <p className="flex items-center gap-2">
                  <span className="text-[#E53935]">✉</span>
                  nextacademi@gmail.com
                </p>

                <p className="flex items-center gap-2">
                  <span className="text-[#E53935]">📍</span>
                  Singapore
                </p>
              </div>
            </Reveal>

            <Reveal index={1}>
              <ContactForm />
            </Reveal>
          </div>
        </section>

        {/* FOOTER — dark per the reference theme */}
        <footer className="border-t border-white/10 bg-[#0B0D10] text-white">
          <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 md:grid-cols-[1.4fr_1fr_1fr] md:gap-6 md:px-10 md:py-8">
            <div>
              <Brand light />
              <p className="mt-3 max-w-xs text-sm leading-6 text-white/50">
                Practical learning for people building stronger careers,
                classrooms, and communities.
              </p>
              <button
                onClick={goToLearning}
                className="mt-5 inline-flex items-center rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/20"
              >
                Go to My Learning <span className="ml-2">↗</span>
              </button>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/40">
                Explore
              </p>
              <div className="mt-4 grid gap-2.5 text-sm text-white/70">
                <a href="#home" className="transition hover:text-white">
                  Home
                </a>
                <a href="#training" className="transition hover:text-white">
                  Training
                </a>
                <a href="#events" className="transition hover:text-white">
                  Events
                </a>
                <a href="#about" className="transition hover:text-white">
                  About
                </a>
                <a href="#contact" className="transition hover:text-white">
                  Contact
                </a>
              </div>
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/40">
                Get in touch
              </p>
              <div className="mt-4 grid gap-2.5 text-sm text-white/70">
                <a
                  href="mailto:nextacademi@gmail.com"
                  className="flex items-center gap-2 transition hover:text-white"
                >
                  <span className="text-white/40">✉</span> nextacademi@gmail.com
                </a>
                <span className="flex items-center gap-2">
                  <span className="text-white/40">📍</span> Singapore
                </span>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 px-5 py-4 md:px-10">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-[11px] text-white/40 sm:flex-row">
              <span>© 2026 Next Academy. Learning for what comes next.</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#F04438]" />{" "}
                Singapore
              </span>
            </div>
          </div>
        </footer>
      </main>
  );
}
