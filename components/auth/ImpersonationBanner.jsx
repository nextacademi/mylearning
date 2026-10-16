"use client";

import { useEffect, useState } from "react";
import { Loader2, LogOut, Undo2, X } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { returnToStaffAccount } from "../../lib/services/impersonation-service";

// While an Admin/Director is logged in as someone else (the session's ID
// token carries the server-set `impersonatedBy` claim) the app looks and
// behaves exactly as it does for that person — the only addition is this
// small corner button to get back to the staff account. Bottom-left, so it
// never sits on the AI assistant button (bottom-right).
export default function ImpersonationBanner() {
  const { user, profile, logout } = useAuth();
  const [claims, setClaims] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      void Promise.resolve().then(() => { if (!cancelled) setClaims(null); });
      return () => { cancelled = true; };
    }
    user.getIdTokenResult()
      .then((result) => { if (!cancelled) setClaims(result.claims.impersonatedBy ? result.claims : null); })
      .catch(() => { if (!cancelled) setClaims(null); });
    return () => { cancelled = true; };
  }, [user]);

  if (!claims) return null;

  async function goBack() {
    setBusy(true);
    setError("");
    try {
      await returnToStaffAccount();
    } catch (err) {
      setError(err.message || "Couldn't switch back.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-[90] grid h-11 w-11 place-items-center rounded-full bg-slate-900/85 text-white shadow-lg backdrop-blur transition hover:bg-slate-900 print:hidden"
        title={`Logged in as this user by ${claims.impersonatorName || "staff"} — click to return`}
        aria-label="Return to my account"
      >
        <Undo2 className="h-5 w-5" aria-hidden="true" />
      </button>
    );
  }

  const name = profile?.displayName || profile?.email || user.email || "this user";
  return (
    <div className="fixed bottom-4 left-4 z-[90] w-72 rounded-2xl border border-border-subtle bg-card p-4 text-xs text-ink shadow-2xl print:hidden" role="dialog" aria-label="Logged in as another user">
      <button type="button" onClick={() => setOpen(false)} className="absolute right-2 top-2 rounded-lg p-1 text-subtle hover:bg-page hover:text-ink" aria-label="Hide">
        <X className="h-4 w-4" />
      </button>
      <p className="pr-6 text-muted">
        Logged in as <b className="text-ink">{name}</b>{profile?.role ? ` (${profile.role})` : ""} by {claims.impersonatorName || "staff"}.
      </p>
      {error && <p className="mt-2 font-semibold text-primary">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={goBack} disabled={busy} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 font-bold text-white hover:bg-primary-hover disabled:opacity-60">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />}
          Return to my account
        </button>
        {error && (
          <button type="button" onClick={logout} className="inline-flex items-center gap-1 rounded-xl border border-border-subtle px-3 py-2 font-bold hover:bg-page" title="Sign out completely">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
