"use client";

import { useEffect, useState } from "react";
import { Loader2, LogOut, Undo2 } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { getImpersonation, returnToStaffAccount, signOutCompletely } from "../../lib/services/impersonation-service";

// While an Admin/Director is logged in as someone else the app looks and
// behaves exactly as it does for that person — the only addition is this
// labelled corner button to get back to the staff account (the header's
// "Sign out" does the same, see auth-context `logout`). Bottom-left, so it
// never sits on the AI assistant button (bottom-right).
export default function ImpersonationBanner() {
  const { user, profile } = useAuth();
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getImpersonation(user)
      .then((value) => { if (!cancelled) setSession(value); })
      .catch(() => { if (!cancelled) setSession(null); });
    return () => { cancelled = true; };
  }, [user]);

  if (!session) return null;

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

  const name = profile?.displayName || profile?.email || user?.email || "this user";
  return (
    <div className="fixed bottom-4 left-4 z-[90] max-w-[calc(100vw-2rem)] print:hidden">
      {error && (
        <div className="mb-2 w-72 max-w-full rounded-2xl border border-border-subtle bg-card p-3 text-xs text-ink shadow-2xl" role="alert">
          <p className="font-semibold text-primary">{error}</p>
          <button type="button" onClick={signOutCompletely} className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-border-subtle px-3 py-1.5 font-bold hover:bg-page">
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" /> Sign out completely
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={goBack}
        disabled={busy}
        className="flex max-w-full items-center gap-2.5 rounded-full bg-slate-900/90 py-2 pl-3 pr-4 text-left text-white shadow-lg backdrop-blur transition hover:bg-slate-900 disabled:opacity-70"
        title={`Logged in as ${name} by ${session.staffName}`}
      >
        {busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" /> : <Undo2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
        <span className="min-w-0 leading-tight">
          <span className="block max-w-[13rem] truncate text-[10px] text-white/70">
            Viewing as {name}{profile?.role ? ` · ${profile.role}` : ""}
          </span>
          <b className="block text-xs">Return to my account</b>
        </span>
      </button>
    </div>
  );
}
