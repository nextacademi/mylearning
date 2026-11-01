"use client";

import { useEffect, useState } from "react";
import { Mail, Phone, ShieldCheck, User, X } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { updateMyProfile } from "../../lib/profile-data";
import { acceptAgreement, loadAgreement } from "../../lib/services/agreement-service";

// First things a member sees after signing in (wraps every /dashboard and
// /teacher page — see app/dashboard/layout.js):
//   1. The member agreement (Website → Agreement in the admin panel) —
//      blocks the app until accepted; Sign out is the only other way out.
//   2. "Complete your profile" — when their name or phone is missing.
//      Can be skipped for this browser session with ×.
// The page itself keeps rendering behind the blurred overlay.

const SKIP_KEY = "onboarding:profile-skipped";

// Agreement body text: blank line = new paragraph, "- " lines = bullets.
export function AgreementText({ body }) {
  const blocks = String(body || "").split(/\n\s*\n/).map((block) => block.split("\n").filter((line) => line.trim()));
  return blocks.map((lines, i) => {
    if (lines.length && lines.every((line) => /^\s*[-•]\s+/.test(line))) {
      return (
        <ul key={i} className="my-3 space-y-1.5 pl-5">
          {lines.map((line, j) => <li key={j} className="list-disc text-[15px] leading-7 text-ink marker:text-primary">{line.replace(/^\s*[-•]\s+/, "")}</li>)}
        </ul>
      );
    }
    // A paragraph followed by bullets in the same block ("This applies to:\n- …").
    const firstBullet = lines.findIndex((line) => /^\s*[-•]\s+/.test(line));
    if (firstBullet > 0) {
      return (
        <div key={i}>
          <p className="my-3 text-[15px] leading-7 text-ink">{lines.slice(0, firstBullet).join(" ")}</p>
          <ul className="my-3 space-y-1.5 pl-5">
            {lines.slice(firstBullet).map((line, j) => <li key={j} className="list-disc text-[15px] leading-7 text-ink marker:text-primary">{line.replace(/^\s*[-•]\s+/, "")}</li>)}
          </ul>
        </div>
      );
    }
    return <p key={i} className="my-3 text-[15px] leading-7 text-ink">{lines.join(" ")}</p>;
  });
}

function formatEffective(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "";
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function Overlay({ children }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
      {children}
    </div>
  );
}

function Brand() {
  return (
    <div className="mx-auto flex w-fit items-center gap-2 rounded-2xl bg-card px-3 py-1.5 shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.jpeg" alt="" className="h-8 w-8 rounded-lg object-contain" />
      <span className="text-sm font-black text-ink">Next <span className="text-primary">Academy</span></span>
    </div>
  );
}

function ProfileStep({ user, profile, title, subtitle, onDone, onSkip }) {
  const [name, setName] = useState(profile?.displayName || user.displayName || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(event) {
    event.preventDefault();
    if (name.trim().length < 2) return setError("Enter your full name.");
    if (!/^\+?[\d\s()-]{6,20}$/.test(phone.trim())) return setError("Enter a valid phone number.");
    setSaving(true);
    setError("");
    try {
      await updateMyProfile(user.uid, { displayName: name.trim(), phone: phone.trim() });
      onDone();
    } catch (err) {
      setError(err.message || "Unable to save your details.");
      setSaving(false);
    }
  }

  const field = "w-full rounded-xl border border-border-subtle bg-card py-3 pl-10 pr-3 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30";
  return (
    <Overlay>
      <form onSubmit={save} className="relative w-full max-w-md overflow-hidden rounded-3xl bg-card shadow-2xl">
        <div className="bg-[linear-gradient(135deg,#fff0f0_0%,#ffffff_70%)] px-7 pb-5 pt-7">
          <button type="button" onClick={onSkip} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl border border-border-subtle bg-card text-muted hover:text-ink" aria-label="Skip for now">
            <X className="h-4 w-4" />
          </button>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-white shadow-md"><User className="h-6 w-6" aria-hidden="true" /></span>
          <h2 className="mt-4 text-2xl font-black text-ink">{title || "Complete your profile"}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="space-y-4 px-7 pb-7 pt-2">
          <label className="block text-xs font-bold text-muted">
            Full name
            <span className="relative mt-1.5 block">
              <User className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-subtle" aria-hidden="true" />
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Your full name" className={field} required />
            </span>
          </label>
          <label className="block text-xs font-bold text-muted">
            Email address
            <span className="relative mt-1.5 block">
              <Mail className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-subtle" aria-hidden="true" />
              <input value={user.email || ""} readOnly className={`${field} bg-page text-muted`} />
            </span>
          </label>
          <label className="block text-xs font-bold text-muted">
            Phone number
            <span className="relative mt-1.5 block">
              <Phone className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-subtle" aria-hidden="true" />
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+65 9123 4567" className={field} required />
            </span>
          </label>
          {error && <p className="rounded-xl bg-active px-3 py-2 text-xs font-semibold text-primary">{error}</p>}
          <button disabled={saving} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-md transition hover:bg-primary-hover disabled:opacity-60">
            {saving ? "Saving…" : "Save and continue"}
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function AgreementStep({ agreement, onAccepted, onSignOut }) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const effective = formatEffective(agreement.effectiveDate);

  async function accept() {
    setSaving(true);
    setError("");
    try {
      await acceptAgreement(agreement.version);
      onAccepted();
    } catch (err) {
      setError(err.message || "Unable to record your acceptance.");
      setSaving(false);
    }
  }

  return (
    <Overlay>
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-card shadow-2xl">
        <header className="shrink-0 border-b border-border-subtle bg-[linear-gradient(135deg,#fff0f0_0%,#ffffff_70%)] px-6 py-5 text-center">
          <Brand />
          <h2 className="mt-3 text-2xl font-black text-ink sm:text-3xl">{agreement.title}</h2>
          {(effective || agreement.version) && (
            <p className="mt-1 text-sm font-bold text-primary">{[effective && `Effective ${effective}`, agreement.version].filter(Boolean).join(" · ")}</p>
          )}
          {agreement.subtitle && <p className="mt-2 text-sm text-muted">{agreement.subtitle}</p>}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-2">
          {agreement.sections.map((section, i) => (
            <section key={i} className="border-b border-border-subtle py-4 last:border-0">
              {section.heading && <h3 className="border-b border-border-subtle pb-2 text-lg font-bold text-ink">{section.heading}</h3>}
              <AgreementText body={section.body} />
            </section>
          ))}
        </div>
        <footer className="shrink-0 space-y-3 border-t border-border-subtle bg-page px-6 py-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]" />
            <span>{agreement.checkboxLabel}</span>
          </label>
          {error && <p className="rounded-xl bg-active px-3 py-2 text-xs font-semibold text-primary">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-[1.5fr_1fr]">
            <button type="button" onClick={accept} disabled={!agreed || saving} className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-base font-bold text-white shadow-md transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "Saving…" : <><ShieldCheck className="h-5 w-5" aria-hidden="true" /> I Agree &amp; Continue</>}
            </button>
            <button type="button" onClick={onSignOut} className="rounded-xl border border-border-subtle bg-card py-3.5 text-base font-semibold text-ink hover:bg-page">Sign out</button>
          </div>
        </footer>
      </div>
    </Overlay>
  );
}

export default function OnboardingGate({ children }) {
  const { user, profile, logout } = useAuth();
  const [agreementState, setAgreementState] = useState(null); // { agreement, mustAccept }
  const [agreementChecked, setAgreementChecked] = useState(false);
  const [profileSkipped, setProfileSkipped] = useState(() => {
    try {
      return typeof window !== "undefined" && window.sessionStorage.getItem(SKIP_KEY) === "1";
    } catch {
      return false;
    }
  });

  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    loadAgreement()
      .then((data) => { if (!cancelled) setAgreementState(data); })
      .catch(() => { if (!cancelled) setAgreementState(null); })
      .finally(() => { if (!cancelled) setAgreementChecked(true); });
    return () => { cancelled = true; };
  }, [uid, profile?.role]);

  // Wait for the agreement check so the profile popup never flashes first.
  if (!user || !profile || !agreementChecked) return children;

  const needsProfile = !profileSkipped && (!String(profile.displayName || "").trim() || !String(profile.phone || "").trim());
  const needsAgreement = Boolean(agreementState?.mustAccept);

  return (
    <>
      {children}
      {needsAgreement ? (
        <AgreementStep
          agreement={agreementState.agreement}
          onAccepted={() => setAgreementState((s) => ({ ...s, mustAccept: false }))}
          onSignOut={logout}
        />
      ) : needsProfile ? (
        <ProfileStep
          user={user}
          profile={profile}
          title={agreementState?.agreement?.profileTitle}
          subtitle={agreementState ? agreementState.agreement?.profileSubtitle : "Please add these details before continuing to use Next Academy."}
          onDone={() => setProfileSkipped(true)}
          onSkip={() => {
            try { window.sessionStorage.setItem(SKIP_KEY, "1"); } catch { /* storage unavailable */ }
            setProfileSkipped(true);
          }}
        />
      ) : null}
    </>
  );
}
