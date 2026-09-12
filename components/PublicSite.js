"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Award, GraduationCap, Rocket, Star } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { submitContactInquiry } from "../lib/contact-inquiries-data";
import { subscribePublishedEvents } from "../lib/public-events-data";
import { computeEventStatus, isRegistrationOpen } from "../lib/events-shared";

// Landing-page-only color system (blood red + white/off-white + dark text).
// Kept local to this file (arbitrary Tailwind values) rather than in
// globals.css's shared --dash-* tokens, since those are explicitly scoped
// to dashboard surfaces — this keeps the redesign isolated to the public
// site with zero risk of bleeding into dashboard/admin/teacher/student UI.
const RED = "#E53935";
const RED_BRIGHT = "#F04438";
const RED_DEEP = "#B91C1C";
const RED_DARK = "#7F1D1D";
const INK = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const OFFWHITE = "#FAFAF7";

const image = (id, width = 1200) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;
const photos = {
  hero: image("photo-1523240795612-9a054b0db644", 1600),
  about: image("photo-1523580846011-d3a5bc25702b"),
  galleryOne: image("photo-1524178232363-1fb2b075b655"),
  galleryTwo: image("photo-1529390079861-591de354faf5"),
  galleryThree: image("photo-1543269865-cbf427effbad"),
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
  },
  {
    category: "Teaching",
    title: "Teach for impact",
    copy: "Turn expertise into learning experiences that stay with people.",
    src: "/tranning3.jpeg",
    accent: RED_DEEP,
  },
  {
    category: "Community",
    title: "Grow together",
    copy: "Create stronger communities through empathy, collaboration, and action.",
    src: "/tranning4.jpeg",
    accent: RED_DEEP,
  },
  {
    category: "Career",
    title: "Build what is next",
    copy: "Develop practical skills for a changing world of work.",
    src: "/tranning5.jpeg",
    accent: RED,
  },
];

const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

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

const stats = [
  { label: "Total Students", value: 400, suffix: "+" },
  { label: "Active Students", value: 120, suffix: "+" },
  { label: "Total Course", value: 25, suffix: "+" },
  { label: "Total Orientation Class", value: 25, suffix: "+" },
  { label: "Workshop", value: 10, suffix: "+" },
  { label: "Certificate Given", value: 15, suffix: "+" },
];

const milestones = [
  {
    number: "01",
    icon: GraduationCap,
    title: "Program Completed",
    description: "Learners complete practical training.",
  },
  {
    number: "02",
    icon: Award,
    title: "Certificate Earned",
    description: "1,850+ certificates earned.",
  },
  {
    number: "03",
    icon: Rocket,
    title: "Skills Applied",
    description: "Skills move into real work and projects.",
  },
  {
    number: "04",
    icon: Star,
    title: "Next Milestone",
    description: "Keep learning. Keep growing.",
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
      className={`flex items-center gap-2 text-lg font-bold tracking-tight ${light ? "text-white" : "text-[#111827]"}`}
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

function Eyebrow({ children, className = "" }) {
  return (
    <p
      className={`inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[.2em] text-[#E53935] ${className}`}
    >
      <span className="h-[2px] w-6 bg-[#E53935]" />
      {children}
    </p>
  );
}

// All 6 stats shown at once, in one compact row (a sequential one-at-a-time
// carousel was tried and reverted in favor of this columnar view). Each
// number still counts 0 -> value (rAF + easeOutCubic), holds briefly,
// resets to 0, and loops — but only while the row is actually on screen:
// one shared IntersectionObserver flips `visible`, and each AnimatedCounter
// starts/stops its own loop off that single flag, so scrolling away pauses
// every counter (no wasted CPU) and scrolling back replays them from 0.
function AnimatedCounter({
  value,
  suffix = "",
  active,
  duration = 2500,
  holdMs = 3000,
  resetMs = 500,
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!active) return undefined;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      const frameId = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(frameId);
    }

    let frameId = null;
    let timeoutId = null;
    let cancelled = false;

    function countUp() {
      const startTime = performance.now();

      function tick(now) {
        if (cancelled) return;

        const progress = Math.min((now - startTime) / duration, 1);
        const eased = 1 - (1 - progress) ** 3;

        setDisplay(Math.round(eased * value));

        if (progress < 1) {
          frameId = requestAnimationFrame(tick);
        } else {
          timeoutId = setTimeout(() => {
            if (cancelled) return;

            setDisplay(0);

            timeoutId = setTimeout(() => {
              if (!cancelled) countUp();
            }, resetMs);
          }, holdMs);
        }
      }

      frameId = requestAnimationFrame(tick);
    }

    countUp();

    return () => {
      cancelled = true;

      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, [active, value, duration, holdMs, resetMs]);

  return (
    <span
      className="tabular-nums inline-block"
      style={{
        minWidth: `${String(value).length + suffix.length}ch`,
      }}
    >
      {display}
      {suffix}
    </span>
  );
}

function AnimatedStatsRow({ items }) {
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
      className="rounded-2xl border border-[#E5E7EB] bg-white px-3 py-4 shadow-sm sm:px-5 sm:py-5 lg:px-6"
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-6 lg:gap-x-2 lg:gap-y-0">
        {items.map((stat, index) => (
          <div
            key={stat.label}
            className={`flex flex-col items-center justify-center px-1 text-center ${index !== 0 ? "lg:border-l lg:border-[#E5E7EB]" : ""}`}
          >
            <strong className="block text-2xl font-black tracking-tight text-[#B91C1C] sm:text-3xl">
              <AnimatedCounter
                value={stat.value}
                suffix={stat.suffix}
                active={visible}
              />
            </strong>
            <span className="mt-1 block max-w-[9rem] text-[10px] font-semibold leading-4 text-[#6B7280] sm:text-xs">
              {stat.label}
            </span>
          </div>
        ))}
      </div>
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

  const upcomingEvents = events
    .map((event) => ({ ...event, computedStatus: computeEventStatus(event) }))
    .filter((event) => event.computedStatus === "Upcoming" || event.computedStatus === "Ongoing")
    .sort(
      (a, b) =>
        (a.eventDate || "").localeCompare(b.eventDate || "") ||
        (a.startTime || "").localeCompare(b.startTime || ""),
    )
    .slice(0, 6);

  return (
    <main className="overflow-x-clip bg-white text-[#111827]">
      {/* NAVBAR — landing page only */}
      <nav className="sticky top-0 z-50 border-b border-[#E5E7EB] bg-white/95 shadow-sm backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:px-10">
          <Brand />
          <div
            className={`${menuOpen ? "absolute left-0 right-0 top-16 block border-t border-[#E5E7EB] bg-white px-5 py-5 shadow-lg" : "hidden"} md:static md:flex md:items-center md:gap-8 md:border-0 md:bg-transparent md:p-0`}
          >
            <a
              href="#home"
              className="block py-2 text-sm font-medium text-[#374151] transition hover:text-[#E53935]"
            >
              Home
            </a>
            <a
              href="#training"
              className="block py-2 text-sm font-medium text-[#374151] transition hover:text-[#E53935]"
            >
              Training
            </a>
            <a
              href="#events"
              className="block py-2 text-sm font-medium text-[#374151] transition hover:text-[#E53935]"
            >
              Events
            </a>
            <a
              href="#about"
              className="block py-2 text-sm font-medium text-[#374151] transition hover:text-[#E53935]"
            >
              About
            </a>
            <a
              href="#contact"
              className="block py-2 text-sm font-medium text-[#374151] transition hover:text-[#E53935]"
            >
              Contact
            </a>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={goToLearning}
              className="rounded-full bg-[#E53935] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#F04438]"
            >
              My Learning <span className="ml-2">↗</span>
            </button>
            {verifiedUser ? (
              <div className="relative">
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="grid h-9 w-9 place-items-center rounded-full border border-[#E5E7EB] bg-[#FAFAF7] text-xs font-bold text-[#111827]"
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
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/login"
                  className="text-xs font-semibold text-[#374151] hover:text-[#E53935]"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="hidden text-xs font-semibold text-[#374151] hover:text-[#E53935] sm:block"
                >
                  Register
                </Link>
              </div>
            )}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="text-2xl text-[#111827] md:hidden"
              aria-label="Toggle navigation"
            >
              ☰
            </button>
          </div>
        </div>
        {menuOpen && !verifiedUser && (
          <div className="border-t border-[#E5E7EB] bg-white px-5 pb-5 md:hidden">
            <Link
              href="/register"
              className="block py-3 text-sm font-semibold text-[#111827]"
            >
              Register
            </Link>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="home" className="bg-[#FAFAF7]">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-5 py-10 md:grid-cols-2 md:gap-12 md:px-10 md:py-14">
          <div>
            <Eyebrow>Next Academy · Learning for what comes next</Eyebrow>

            <h1 className="mt-4 max-w-xl text-5xl font-black leading-[1.03] tracking-[-.03em] text-[#111827] md:text-6xl lg:text-7xl">
              Learn today.
              <br />
              <span className="text-[#7F1D1D]">Lead tomorrow.</span>
            </h1>

            <p className="mt-5 max-w-md text-base leading-7 text-[#6B7280] md:text-lg">
              Practical learning for people building stronger careers,
              classrooms, and communities.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <a
                href="#training"
                className="rounded-full bg-[#7F1D1D] px-6 py-3.5 text-sm font-bold text-white transition hover:bg-[#991B1B]"
              >
                Explore programs <span className="ml-3">→</span>
              </a>

              <button
                onClick={goToLearning}
                className="rounded-full border border-[#E5E7EB] bg-white px-6 py-3.5 text-sm font-bold text-[#111827] transition hover:border-[#111827]"
              >
                My Learning <span className="ml-3">↗</span>
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-3xl shadow-xl shadow-black/5">
              <img
                src={photos.hero}
                alt="Next Academy learners in session"
                className="h-[300px] w-full object-cover md:h-[380px]"
              />
            </div>

            <div className="absolute -bottom-6 -left-4 max-w-[220px] rounded-2xl bg-[#7F1D1D] p-5 text-white shadow-xl shadow-black/10 sm:-left-6">
              <p className="text-3xl font-black">400+</p>

              <p className="mt-1 text-xs leading-5 text-white/85">
                students trained and growing every term
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section
        id="about"
        className="mx-auto grid max-w-7xl gap-8 px-5 py-12 md:grid-cols-[.8fr_1.2fr] md:items-center md:gap-12 md:px-10 md:py-16"
      >
        <div>
          <Eyebrow>About Next Academy</Eyebrow>
          <h2 className="mt-5 max-w-lg text-4xl font-black leading-[1.05] tracking-[-.03em] text-[#111827] md:text-5xl">
            Building skills that create real opportunities.
          </h2>
          <p className="mt-6 max-w-md text-base leading-7 text-[#6B7280]">
            We bring educators, practitioners, and changemakers together to make
            meaningful learning practical, human, and connected to the future
            people want to build.
          </p>
        </div>
        <div className="grid gap-5 md:grid-cols-[1.25fr_.75fr]">
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
            <p className="mt-8 text-2xl font-bold leading-tight">
              A future where every learner can find their voice and strengthen
              the world around them.
            </p>
          </div>
        </div>
      </section>

      {/* TRAINING / PROGRAMS */}
      <section id="training" className="border-y border-[#E5E7EB] bg-[#FAFAF7]">
        <div className="mx-auto max-w-6xl px-5 py-4 md:px-8 md:py-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Eyebrow>What we do</Eyebrow>

              <h2 className="mt-2 text-3xl font-black tracking-[-.03em] text-[#111827] md:text-4xl">
                Programs built around real needs.
              </h2>
            </div>
          </div>

          <div className="mt-4 grid gap-5 md:grid-cols-2">
            {programs.map((program) => (
              <article
                className="group overflow-hidden rounded-2xl border border-[#E5E7EB] border-t-4 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg"
                style={{ borderTopColor: program.accent }}
                key={program.title}
              >
                {/* Smaller thumbnail */}
                <div className="h-52 overflow-hidden md:h-56">
                  <img
                    src={program.src}
                    alt={program.title}
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                  />
                </div>

                {/* Compact content */}
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

                  <button className="mt-3 text-sm font-bold text-[#E53935]">
                    Learn more <span className="ml-2">→</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* IMPACT NUMBERS */}
      <section className="bg-[#FAFAF9]">
        <div className="mx-auto max-w-7xl px-4 py-5 md:px-7 md:py-6">
          <div className="text-left ">
            <Eyebrow className="justify-center">Our Impact</Eyebrow>
          </div>

          <div className="mt-3">
            <AnimatedStatsRow items={stats} />
          </div>
        </div>
      </section>

      {/* EVENTS */}
      <section
        id="events"
        className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16"
      >
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <Eyebrow>Event calendar</Eyebrow>
            <h2 className="mt-5 text-4xl font-black tracking-[-.03em] text-[#111827] md:text-5xl">
              Learn, connect and grow together.
            </h2>
          </div>
          <a href="#contact" className="text-sm font-bold text-[#E53935]">
            View all events →
          </a>
        </div>
        {!eventsLoaded ? (
          <p className="mt-8 text-sm text-[#6B7280]">Loading events...</p>
        ) : !upcomingEvents.length ? (
          <p className="mt-8 text-sm text-[#6B7280]">
            No upcoming events at the moment.
          </p>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {upcomingEvents.map((event) => {
              const day = event.eventDate ? event.eventDate.slice(8, 10) : null;
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
                <article
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
                          <small className="font-mono text-[9px]">{month}</small>
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
                    {(event.bannerUrl ? fullDate : null) || timeRange || event.location ? (
                      <p className="mt-2 text-xs text-[#6B7280]">
                        {[event.bannerUrl ? fullDate : null, timeRange, event.location]
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
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* WHY NEXT ACADEMY */}
      <section className="border-y border-[#E5E7EB] bg-[#FAFAF7]">
        <div className="mx-auto grid max-w-7xl gap-5 px-4 py-7 md:grid-cols-[.8fr_1.2fr] md:gap-8 md:px-7 md:py-9">
          <div>
            <Eyebrow>Why Next Academy</Eyebrow>

            <h2 className="mt-3 max-w-md text-3xl font-bold leading-[1.05] tracking-[-0.04em] text-[#111827] md:text-4xl">
              A better way to keep growing.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2">
            {[
              [
                "01",
                "Practical learning",
                "Every session connects ideas to action.",
              ],
              [
                "02",
                "Expert mentors",
                "Learn from people who have done the work.",
              ],
              [
                "03",
                "Career growth",
                "Build confidence that travels with you.",
              ],
              ["04", "Community", "Find people who make the journey richer."],
            ].map(([number, title, copy]) => (
              <div
                key={number}
                className="border-t border-[#E5E7EB] px-2 py-4 sm:px-4"
              >
                <span className="font-mono text-[10px] font-bold tracking-widest text-[#E53935]">
                  {number}
                </span>

                <h3 className="mt-2 text-base font-semibold tracking-[-0.01em] text-[#111827] md:text-lg">
                  {title}
                </h3>

                <p className="mt-1 text-xs leading-5 text-[#6B7280] md:text-sm">
                  {copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ACHIEVEMENTS / IMPACT — sharp, editorial, no cards/rounded corners */}
      <section className="mx-auto max-w-7xl px-5 py-8 md:px-10 md:py-10">
        <div className="grid gap-8 md:grid-cols-[1fr_1.1fr] md:items-center md:gap-12">
          <div>
            <Eyebrow>Achievements</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold tracking-[-.02em] text-[#111827] md:text-4xl">
              Progress worth celebrating.
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-[#6B7280] md:text-base">
              From first certificates to community-wide recognition, every
              milestone is part of the story. Our learners leave with proof of
              what they can do.
            </p>
            <div className="mt-6 flex gap-10">
              <div className="border-l-2 border-[#E5E7EB] pl-4">
                <strong className="block text-3xl font-bold text-[#B91C1C]">
                  1,850
                </strong>
                <span className="mt-1 block text-xs text-[#6B7280]">
                  Certificates earned
                </span>
              </div>
              <div className="border-l-2 border-[#E5E7EB] pl-4">
                <strong className="block text-3xl font-bold text-[#B91C1C]">
                  94%
                </strong>
                <span className="mt-1 block text-xs text-[#6B7280]">
                  Completion rate
                </span>
              </div>
            </div>
          </div>
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[.2em] text-[#B91C1C]">
              Achievement Journey
            </p>

            {/* One horizontal row of 4 milestones — icon, number, title,
                description — separated by a thin vertical divider. No
                card, no image, no rounded corners, no shadow. */}
            <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4 sm:gap-x-0">
              {milestones.map((item, index) => (
                <div
                  key={item.number}
                  className={`px-1 text-center sm:px-4 ${index !== 0 ? "sm:border-l sm:border-[#E5E7EB]" : ""}`}
                >
                  <item.icon
                    className="mx-auto h-5 w-5 text-[#B91C1C]"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <p className="mt-2 font-mono text-[10px] font-bold text-[#B91C1C]">
                    {item.number}
                  </p>
                  <h3 className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#111827] sm:text-sm">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-[#6B7280]">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="bg-[#FAFAF7]">
        <div className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <Eyebrow>Learner voices</Eyebrow>
              <h2 className="mt-5 text-4xl font-black tracking-[-.03em] text-[#111827] md:text-5xl">
                What our learners say.
              </h2>
            </div>
            <p className="max-w-xs text-sm leading-6 text-[#6B7280]">
              The best measure of our work is what people do with it next.
            </p>
          </div>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              [
                photos.learner,
                "Mina S.",
                "Leadership graduate",
                "The sessions gave me language for things I had felt but could not yet explain.",
              ],
              [
                photos.mentor,
                "Dara K.",
                "Teacher participant",
                "I left with tools I could use with my students the very next morning.",
              ],
              [
                photos.teacher,
                "Sophea R.",
                "Community fellow",
                "Next Academy feels ambitious and kind at the same time.",
              ],
            ].map(([src, name, role, quote]) => (
              <figure
                className="rounded-2xl border border-[#E5E7EB] bg-white p-7 shadow-sm transition hover:shadow-md"
                key={name}
              >
                <div className="flex items-center gap-3">
                  <img
                    src={src}
                    alt={name}
                    className="h-11 w-11 rounded-full object-cover"
                  />
                  <span className="text-2xl leading-none text-[#E53935]">
                    “
                  </span>
                </div>
                <blockquote className="mt-5 text-lg font-semibold leading-7 text-[#111827]">
                  {quote}
                </blockquote>
                <figcaption className="mt-6 border-t border-[#E5E7EB] pt-4 text-xs">
                  <b className="text-[#111827]">{name}</b>
                  <span className="ml-2 text-[#6B7280]">{role}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section className="mx-auto max-w-7xl px-5 py-12 md:px-10 md:py-16">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <Eyebrow>Activities / gallery</Eyebrow>
            <h2 className="mt-5 text-4xl font-black tracking-[-.03em] text-[#111827] md:text-5xl">
              Show up. Try things. Belong.
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-6 text-[#6B7280]">
            Learning happens in classrooms, conversations, and all the moments
            between.
          </p>
        </div>
        <div className="mt-8 grid auto-rows-[190px] grid-cols-2 gap-4 md:auto-rows-[210px] md:grid-cols-4">
          <img
            src={photos.galleryOne}
            alt="Learners in a workshop"
            className="col-span-2 row-span-2 h-full w-full rounded-2xl object-cover"
          />
          <img
            src={photos.galleryTwo}
            alt="Academy discussion"
            className="h-full w-full rounded-2xl object-cover"
          />
          <img
            src={photos.galleryThree}
            alt="Group activity"
            className="h-full w-full rounded-2xl object-cover"
          />
          <div className="col-span-2 flex items-center rounded-2xl bg-[#E53935] p-6 text-2xl font-black leading-tight text-white md:text-3xl">
            Make room for
            <br />
            what comes next.
          </div>
        </div>
      </section>

      {/* CONTACT FORM */}
      <section id="contact" className="bg-[#FAFAF7]">
        <div className="mx-auto grid max-w-7xl gap-5 px-4 py-7 md:grid-cols-[.9fr_1.1fr] md:gap-8 md:px-7 md:py-9">
          <div>
            <Eyebrow>Get in touch</Eyebrow>

            <h2 className="mt-3 max-w-lg text-3xl font-bold leading-[1.08] tracking-[-0.04em] text-[#111827] md:text-4xl">
              Have a question? Send us a message.
            </h2>

            <p className="mt-3 max-w-md text-sm leading-6 text-[#6B7280]">
              Whether you&apos;re exploring a program, need support, or want to
              partner with us — our team will get back to you.
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
          </div>

          <ContactForm />
        </div>
      </section>
      {/* FOOTER — landing page only */}
      <footer className="border-t-4 border-[#E53935] bg-[#7F1D1D] text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 md:grid-cols-[1.4fr_1fr_1fr_1.1fr] md:gap-6 md:px-10 md:py-12">
          <div>
            <Brand light />
            <p className="mt-4 max-w-xs text-sm leading-6 text-white/60">
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
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/50">
              Navigate
            </p>
            <div className="mt-4 grid gap-2.5 text-sm text-white/75">
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
            </div>
          </div>
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/50">
              Programs
            </p>
            <div className="mt-4 grid gap-2.5 text-sm text-white/75">
              <a href="#training" className="transition hover:text-white">
                Leadership
              </a>
              <a href="#training" className="transition hover:text-white">
                Teaching
              </a>
              <a href="#training" className="transition hover:text-white">
                Community
              </a>
              <a href="#training" className="transition hover:text-white">
                Career
              </a>
            </div>
          </div>
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/50">
              Contact
            </p>
            <div className="mt-4 grid gap-2.5 text-sm text-white/75">
              <a
                href="mailto:nextacademi@gmail.com"
                className="flex items-center gap-2 transition hover:text-white"
              >
                <span className="text-white/50">✉</span> nextacademi@gmail.com
              </a>
              <a
                href="#contact"
                className="flex items-center gap-2 transition hover:text-white"
              >
                <span className="text-white/50">📍</span> Singapore
              </a>
            </div>
          </div>
        </div>
        <div className="border-t border-white/15 px-5 py-4 md:px-10">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 text-[11px] text-white/45 sm:flex-row">
            <span>© 2026 Next Academy. Learning for what comes next.</span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#F04438]" /> Phnom
              Penh, Cambodia
            </span>
          </div>
        </div>
      </footer>
    </main>
  );
}
