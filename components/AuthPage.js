"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Award,
  BookOpen,
  CalendarCheck,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useAuth } from "../lib/auth-context";

const highlights = [
  {
    icon: BookOpen,
    title: "Structured courses",
    copy: "Lessons, quizzes and assignments in one learning workspace.",
  },
  {
    icon: CalendarCheck,
    title: "Live classes & events",
    copy: "Track schedules, attendance and upcoming sessions.",
  },
  {
    icon: Award,
    title: "Verified certificates",
    copy: "Earn certificates you can share and verify online.",
  },
  {
    icon: Users,
    title: "Learning community",
    copy: "Learn alongside teachers, mentors and fellow students.",
  },
];

function Logo({ light = false }) {
  return (
    <Link
      href="/"
      className={`inline-flex items-center gap-3 text-xl font-bold tracking-tight ${light ? "text-white" : "text-slate-900"}`}
    >
      <img
        src="/logo.jpeg"
        alt="Next Academy logo"
        className="h-11 w-11 rounded-xl bg-white object-contain p-0.5 shadow-lg shadow-red-950/30"
      />
      <span>Next Academy</span>
    </Link>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function FacebookMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12a12 12 0 1 0-13.9 11.85v-8.38H7.08V12h3.02V9.36c0-3 1.79-4.66 4.53-4.66 1.31 0 2.68.23 2.68.23v2.95h-1.51c-1.49 0-1.95.92-1.95 1.87V12h3.32l-.53 3.47h-2.8v8.38A12 12 0 0 0 24 12z"
      />
    </svg>
  );
}

const fieldLabel =
  "block text-[11px] font-semibold uppercase tracking-wider text-slate-600";
const fieldInput =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-normal text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10";

export default function AuthPage({ mode = "login" }) {
  const router = useRouter();
  const auth = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [resetMode, setResetMode] = useState(false);

  useEffect(() => {
    if (!auth.loading && auth.user && auth.profile?.role) {
      router.replace(`/dashboard/${auth.profile.role.toLowerCase()}`);
    }
  }, [auth.loading, auth.profile?.role, auth.user, router]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    auth.clearError();
    try {
      if (resetMode) {
        await auth.resetPassword(email);
        setNotice("Password reset email sent. Check your inbox.");
      } else if (mode === "register") {
        // register() still sends the Firebase verification link email in
        // the background (best-effort) — see /verify-email, which is still
        // reachable to confirm the link later — but new accounts are no
        // longer blocked from the dashboard while it's unverified.
        await auth.register(email, password, name);
      } else {
        await auth.login(email, password);
      }
    } catch {
      // Auth context provides the user-facing message.
    } finally {
      setBusy(false);
    }
  }

  async function social(provider) {
    setBusy(true);
    auth.clearError();
    try {
      await auth.socialLogin(provider);
    } catch {
      // Auth context provides the user-facing message.
    } finally {
      setBusy(false);
    }
  }

  const title = resetMode
    ? "Reset your password"
    : mode === "register"
      ? "Create your account"
      : "Welcome back";
  const subtitle = resetMode
    ? "Enter your email to receive a secure reset link."
    : mode === "register"
      ? "Join the Next Academy learning community."
      : "Sign in to access your learning workspace.";
  const message = auth.error || notice;

  return (
    <main className="grid min-h-screen bg-white text-slate-800 selection:bg-red-600 selection:text-white lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-red-950 via-slate-900 to-red-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-red-600/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-20 h-96 w-96 rounded-full bg-red-500/15 blur-3xl"
        />
        <div className="relative">
          <Logo light />
        </div>
        <div className="relative max-w-lg">
          <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-red-300">
            Your educational &amp; community center
          </p>
          <h2 className="mt-4 text-4xl font-black leading-tight xl:text-5xl">
            Learn what comes next.
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/70">
            One place for your courses, classes, events and certificates —
            built for students, teachers and the whole academy.
          </p>
          <ul className="mt-9 grid gap-5">
            {highlights.map(({ icon: Icon, title: itemTitle, copy }) => (
              <li key={itemTitle} className="flex items-start gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/10">
                  <Icon className="h-5 w-5 text-red-300" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-sm font-bold">{itemTitle}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-white/60">
                    {copy}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-[11px] text-white/40">
          © 2026 Next Academy. Learning for what comes next.
        </p>
      </aside>

      <section className="flex items-center justify-center bg-slate-50 px-5 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:hidden">
            <Logo />
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">
              Your educational &amp; community center
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-900/5 sm:p-8">
            <div className="mb-6 flex rounded-xl bg-slate-100 p-1">
              <a
                href="/login"
                className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold transition ${mode === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Sign In
              </a>
              <a
                href="/register"
                className={`flex-1 rounded-lg py-2 text-center text-sm font-semibold transition ${mode === "register" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Register
              </a>
            </div>

            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>

            {!resetMode && (
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => social("google")}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                >
                  <GoogleMark /> Google
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => social("facebook")}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
                >
                  <FacebookMark /> Facebook
                </button>
              </div>
            )}
            {!resetMode && (
              <div className="my-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <i className="h-px flex-1 bg-slate-200" />
                or continue with email
                <i className="h-px flex-1 bg-slate-200" />
              </div>
            )}

            <form
              onSubmit={submit}
              className={`space-y-4 ${resetMode ? "mt-6" : ""}`}
            >
              {mode === "register" && !resetMode && (
                <label className={fieldLabel}>
                  Full name
                  <input
                    required
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className={fieldInput}
                    placeholder="Alex Morgan"
                    autoComplete="name"
                  />
                </label>
              )}
              <label className={fieldLabel}>
                Email address
                <input
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className={fieldInput}
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                />
              </label>
              {!resetMode && (
                <label className={fieldLabel}>
                  Password
                  <span className="relative block">
                    <input
                      required
                      minLength={6}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className={`${fieldInput} pr-12`}
                      placeholder="At least 6 characters"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        mode === "register" ? "new-password" : "current-password"
                      }
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </span>
                </label>
              )}
              {message && (
                <p
                  role="alert"
                  className={`rounded-xl px-3 py-2 text-xs font-medium ${auth.error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}
                >
                  {message}
                </p>
              )}
              <button
                disabled={busy || !auth.firebaseConfigured}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white shadow-lg shadow-red-600/25 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                {busy
                  ? "Please wait..."
                  : resetMode
                    ? "Send reset link"
                    : mode === "register"
                      ? "Create account"
                      : "Sign in"}
                {!busy && <span aria-hidden="true">→</span>}
              </button>
            </form>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs">
              {!resetMode && mode === "login" && (
                <button
                  type="button"
                  onClick={() => {
                    auth.clearError();
                    setResetMode(true);
                  }}
                  className="font-semibold text-red-600 hover:text-red-700"
                >
                  Forgot password?
                </button>
              )}
              {resetMode && (
                <button
                  type="button"
                  onClick={() => {
                    auth.clearError();
                    setResetMode(false);
                  }}
                  className="font-semibold text-red-600 hover:text-red-700"
                >
                  Back to sign in
                </button>
              )}
              {!resetMode && (
                <span className="text-slate-500">
                  {mode === "login" ? "New here?" : "Already registered?"}{" "}
                  <a
                    href={mode === "login" ? "/register" : "/login"}
                    className="font-semibold text-red-600 hover:text-red-700"
                  >
                    {mode === "login" ? "Create account" : "Sign in"}
                  </a>
                </span>
              )}
            </div>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Secure authentication powered by Firebase
          </p>
        </div>
      </section>
    </main>
  );
}
