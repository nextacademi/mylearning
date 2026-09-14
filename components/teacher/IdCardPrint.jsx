"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import QRCode from "qrcode";
import { issueQrToken } from "../../lib/services/qr-service";

const EASE = [0.22, 1, 0.36, 1];
const fadeSlideUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};
const cardScale = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.45, ease: EASE } },
};
const panelReveal = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE, delay: 0.1 } },
};
const qrPop = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.35, ease: EASE, delay: 0.2 } },
};

// The Digital Membership / D Card. Every value here is real: `userId`
// comes from the authenticated subject's own Firestore doc (see
// app/api/teacher/qr-token/route.js, which backfills it via
// lib/server/user-id.js's ensureUserId if a legacy account predates the
// field) and the QR is a server-signed, versioned token (lib/qr-token.js)
// — never a raw ID rendered client-side, never regenerated with a
// different identity on every refresh. There is deliberately no
// "Volunteer ID"/VID anywhere: the unified User ID is the only ID this
// card (or any part of the app) shows, for every role.
//
// OFFLINE BEHAVIOUR: the signed QR token can only be minted server-side
// (it's an HMAC with QR_TOKEN_SECRET), so first-ever issuance needs the
// network. But the token is valid for 180 days, so once a device has
// loaded the card successfully we cache {token, subject} in localStorage
// and keep showing it when the network is unavailable — reconciling the
// moment connectivity returns. This is why opening the card on a phone
// with a flaky cellular connection no longer dead-ends on a raw
// "Failed to fetch": that call is now best-effort on top of the cache.
// Regenerating (which bumps the server-side qrVersion and invalidates the
// old token) genuinely can't be done offline and is blocked with a clear
// message rather than silently queued — queueing it would leave the user
// showing a QR that's about to stop working with nothing to replace it.

const CACHE_PREFIX = "nacademy.dcard.";
// signQrToken (lib/qr-token.js) bakes a fresh `exp: Date.now() + ttlMs` into
// every signed payload, so calling issueQrToken on every single mount — even
// with regenerate:false — produced a brand-new token/signature (and thus a
// visibly different QR image) each time the card was opened. Skipping the
// network call while a cached token is still this fresh stops that: the QR
// image now stays pixel-identical across visits for a week, instead of
// changing on every load, while still eventually picking up profile changes
// (photo/name/status) without a manual regenerate button (removed above).
const REFRESH_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function cacheKey(mode, studentId) {
  return `${CACHE_PREFIX}${mode === "student" ? `student.${studentId || "unknown"}` : "self"}`;
}

function readCache(key) {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    return parsed && parsed.token && parsed.subject ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota exceeded — the card still works online, it just
    // won't have an offline fallback on this device.
  }
}

function friendlyLoadError(code) {
  if (code === "network")
    return "You appear to be offline. Your ID card will load automatically once you reconnect.";
  if (code === "auth")
    return "Your session has expired. Please sign in again.";
  return "Your ID card could not be generated. Please try again.";
}

export default function IdCardPrint({
  mode,
  studentId,
  fallbackName,
  fallbackEmail,
  roleLabel,
  organization = "Next Academy",
  photoURL,
  active,
  status,
  onEditProfile,
  hideBrandCaption = false,
}) {
  const [key] = useState(() => cacheKey(mode, studentId));
  const [cached] = useState(() => readCache(key));
  const [state, setState] = useState(() =>
    cached
      ? { loading: false, error: "", errorCode: "", token: cached.token, subject: cached.subject, stale: false }
      : { loading: true, error: "", errorCode: "", token: null, subject: null, stale: false },
  );
  const [qr, setQr] = useState({ url: "", error: false });
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  // Promise-chain style (not async/await) on purpose: every setState lives
  // inside a .then/.catch continuation, never synchronously in the effect
  // body — same shape the rest of this codebase uses to stay clear of the
  // "setState synchronously within an effect" rule.
  const load = useCallback(() => {
    const body = mode === "student" ? { mode, studentId, regenerate: false } : { mode: "self", regenerate: false };
    return issueQrToken(body)
      .then((result) => {
        writeCache(key, { token: result.token, subject: result.subject, savedAt: Date.now() });
        setState({ loading: false, error: "", errorCode: "", token: result.token, subject: result.subject, stale: false });
      })
      .catch((error) => {
        // Keep the real error in the console for diagnosis; never show it
        // to the user verbatim.
        console.error("[id-card] failed to issue QR token", { code: error?.code, message: error?.message });
        const fallback = readCache(key);
        if (fallback) {
          setState({ loading: false, error: "", errorCode: error?.code || "", token: fallback.token, subject: fallback.subject, stale: true });
          return;
        }
        setState({
          loading: false,
          error: friendlyLoadError(error?.code),
          errorCode: error?.code || "unknown",
          token: null,
          subject: null,
          stale: false,
        });
      });
  }, [key, mode, studentId]);

  // Initial load / silent refresh: if a cached card is already on screen it
  // must never flash back to a spinner, and if there's no cache the
  // initializer above already set loading:true. Skipped entirely when the
  // cache is still fresh (see REFRESH_AFTER_MS above) so the QR doesn't
  // change on every visit — `cached` comes from a useState initializer, so
  // it never changes after mount and this effect still only runs once.
  useEffect(() => {
    const isFresh = cached && typeof cached.savedAt === "number" && Date.now() - cached.savedAt < REFRESH_AFTER_MS;
    if (isFresh) return;
    load();
  }, [load, cached]);

  // Retry button — unlike the silent refresh, this one shows the spinner.
  function retry() {
    setState((current) => ({ ...current, loading: true, error: "", errorCode: "" }));
    load();
  }

  // Auto-recover the moment the device is back online.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function handleOnline() {
      setOnline(true);
      load();
    }
    function handleOffline() {
      setOnline(false);
    }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [load]);

  useEffect(() => {
    if (!state.token) return undefined;
    let cancelled = false;
    QRCode.toDataURL(state.token, { margin: 1, width: 320 })
      .then((url) => {
        if (!cancelled) setQr({ url, error: false });
      })
      .catch((error) => {
        console.error("[id-card] QR render failed", error);
        if (!cancelled) setQr({ url: "", error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [state.token]);

  if (state.loading) {
    return <div className="rounded-2xl border border-dashed border-border-subtle p-8 text-center text-sm text-muted">Preparing your D Card...</div>;
  }
  if (state.error) {
    return (
      <div className="mx-auto max-w-sm rounded-2xl border border-dashed border-red-line p-6 text-center sm:p-8">
        <p className="text-sm text-primary">{state.error}</p>
        {state.errorCode !== "auth" && (
          <button
            onClick={retry}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-xs font-bold text-white"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  const name = state.subject?.displayName || fallbackName || "Unnamed";
  const email = state.subject?.email || fallbackEmail || "";
  const userId = state.subject?.userId || "—";
  // The server-returned subject (the real target account — the student
  // being viewed in "student" mode, or the caller themselves in "self"
  // mode) always wins over the caller-supplied fallback props, so a
  // Teacher viewing a student's card sees that STUDENT's real photo/status,
  // never the teacher's own.
  const resolvedPhoto = state.subject?.photoURL || photoURL;
  const resolvedActive = state.subject ? state.subject.active !== false : active !== false;
  const resolvedStatus = state.subject?.status || status;
  const isActive = resolvedActive && resolvedStatus !== "pending" && resolvedStatus !== "rejected";
  const statusLabel = resolvedStatus === "pending" ? "Pending" : resolvedStatus === "rejected" ? "Rejected" : isActive ? "Active" : "Inactive";
  const showingOffline = state.stale || !online;

  return (
    <MotionConfig reducedMotion="user">
    <motion.div
      className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-start"
      initial="hidden"
      animate="show"
      variants={fadeSlideUp}
    >
      <style>{`@media print { .no-print { display: none !important; } body * { visibility: hidden; } #id-card, #id-card * { visibility: visible; } #id-card { position: fixed; inset: 0; margin: auto; } }`}</style>

      <div>
        <motion.div
          id="id-card"
          className="mx-auto w-full max-w-sm rounded-3xl border border-red-line bg-gradient-to-b from-active to-card p-5 shadow-sm sm:p-6"
          initial="hidden"
          animate="show"
          variants={cardScale}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <img src="/logo.jpeg" alt={`${organization} logo`} className="h-8 w-8 rounded-lg object-contain" />
              <div>
                <b className="block text-xs text-ink">{organization}</b>
                {/* Skipped whenever the caller already shows its own
                    "Digital Membership" eyebrow above the card (the Settings
                    modal via onEditProfile, or any page-level header that
                    passes hideBrandCaption) — showing it twice would be
                    redundant. Consumers with no such header (a student's
                    card view, the QR check-in dialog) keep it. */}
                {!onEditProfile && !hideBrandCaption && (
                  <small className="block text-[9px] font-bold uppercase tracking-widest text-primary">Digital Membership</small>
                )}
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                isActive ? "bg-success-soft text-success" : status === "pending" ? "bg-warning-soft text-warning" : "bg-active text-primary"
              }`}
            >
              {statusLabel}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-4">
            {resolvedPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolvedPhoto} alt={name} className="h-16 w-16 shrink-0 rounded-full border-2 border-red-line object-cover" />
            ) : (
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-red-line bg-page text-xl font-bold text-subtle">
                {name?.[0]?.toUpperCase() || "?"}
              </span>
            )}
            <div className="min-w-0">
              <b className="block truncate text-base text-ink">{name}</b>
              <span className="block truncate text-sm font-semibold text-primary">{roleLabel}</span>
              <span className="mt-1 inline-block rounded-full bg-page px-2 py-0.5 font-mono text-[10px] font-bold text-muted">
                SID · {userId}
              </span>
            </div>
          </div>

          <div className="my-4 border-t border-dashed border-border-subtle" />

          <p className="text-center text-[10px] font-bold uppercase tracking-widest text-subtle">Check-in QR</p>
          <motion.div
            className="mt-2 grid place-items-center rounded-2xl bg-page p-4"
            initial="hidden"
            animate="show"
            variants={qrPop}
          >
            {qr.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr.url} alt="Attendance check-in QR code" className="h-44 w-44 max-w-full" />
            ) : qr.error ? (
              <span className="px-2 text-center text-xs text-primary">
                Couldn&apos;t draw the QR image on this device. Please try reloading the page.
              </span>
            ) : (
              <span className="text-xs text-subtle">Generating QR...</span>
            )}
          </motion.div>
          <p className="mt-3 text-center text-[11px] text-muted">
            Show this code at check-in. Scan once to start, again when you leave.
          </p>

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-subtle pt-3 text-[10px] text-subtle">
            <span className="truncate">{email}</span>
            <span className="flex shrink-0 items-center gap-2">
              {showingOffline && (
                <span className="rounded-full bg-page px-2 py-0.5 font-bold text-muted">Offline copy</span>
              )}
              {mode !== "student" && onEditProfile && (
                <button type="button" onClick={onEditProfile} className="font-bold text-primary hover:underline">
                  Edit profile →
                </button>
              )}
            </span>
          </div>
        </motion.div>

        {/* No button row under the card anywhere — matches the reference
            design exactly in every context this component renders (Settings
            modal, Teacher's own ID card page, Director/Admin dashboards,
            student card views). Printing is still reachable via the
            browser's own print (window.print()/Ctrl+P) since the #id-card
            node and its @media print rule above are untouched; Regenerate QR
            is removed from the UI entirely per user request — the
            underlying capability (issueQrToken with regenerate:true) is
            left in place server-side, just not exposed as a button. */}
        {showingOffline && (
          <p className="no-print mx-auto mt-2 max-w-sm text-center text-[11px] text-muted">
            Showing your saved card. It will refresh automatically when you&apos;re back online.
          </p>
        )}
      </div>

      <motion.div
        className="no-print rounded-2xl border border-border-subtle bg-card p-6 shadow-sm"
        initial="hidden"
        animate="show"
        variants={panelReveal}
      >
        <b className="text-sm text-ink">How to use</b>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-muted">
          <li>Open this page before you reach the check-in desk.</li>
          <li>Turn screen brightness up so the QR scans easily.</li>
          <li>First scan checks you in; scan again when you leave to record your session.</li>
          <li>The scanner will show your name — make sure it matches you.</li>
          <li>Your QR is tied to your account; do not share screenshots.</li>
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-page p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Role</p>
            <p className="mt-1 text-sm font-semibold text-ink">{roleLabel}</p>
          </div>
          <div className="rounded-xl bg-page p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Student ID</p>
            <p className="mt-1 font-mono text-sm font-semibold text-ink">{userId}</p>
          </div>
          <div className="col-span-2 rounded-xl bg-page p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Account</p>
            <p className="mt-1 text-sm font-semibold text-ink">{statusLabel}</p>
          </div>
        </div>
        {mode !== "student" && onEditProfile && (
          <motion.button
            type="button"
            onClick={onEditProfile}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="mt-4 w-full rounded-xl border border-border-subtle px-4 py-2.5 text-xs font-bold text-ink transition-colors hover:bg-page"
          >
            Update photo &amp; profile in Settings
          </motion.button>
        )}
      </motion.div>
    </motion.div>
    </MotionConfig>
  );
}
