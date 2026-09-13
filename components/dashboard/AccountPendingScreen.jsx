"use client";

import { Clock, ShieldAlert } from "lucide-react";

// Rendered by app/dashboard/[role]/page.jsx INSTEAD of the real dashboard
// for a Student whose profile.status is "pending" or "rejected" — the
// single central gate. No sidebar, no tabs, nothing reachable but this and
// Sign Out, matching the required final UX exactly.
export default function AccountPendingScreen({ status, onLogout }) {
  const rejected = status === "rejected";

  return (
    <div className="grid min-h-screen place-items-center bg-page p-4">
      <div className="w-full max-w-sm rounded-3xl border border-border-subtle bg-card p-8 text-center shadow-sm">
        <span
          className={`mx-auto grid h-14 w-14 place-items-center rounded-full ${rejected ? "bg-active text-primary" : "bg-warning-soft text-warning"}`}
        >
          {rejected ? <ShieldAlert className="h-7 w-7" aria-hidden="true" /> : <Clock className="h-7 w-7" aria-hidden="true" />}
        </span>

        <h1 className="mt-5 text-lg font-bold text-ink">
          {rejected ? "Registration Not Approved" : "Account Not Active"}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {rejected
            ? "Your registration was not approved. Please contact the academy for more information."
            : "Your registration is waiting for administrator approval. You cannot access your Student Dashboard or use academy services until your account is approved."}
        </p>

        <span
          className={`mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${rejected ? "bg-active text-primary" : "bg-warning-soft text-warning"}`}
        >
          {rejected ? "🔴 Registration Rejected" : "🟠 Pending Approval"}
        </span>

        <div className="mt-5 rounded-2xl border border-border-subtle bg-page p-4 text-left">
          <p className="text-xs font-bold text-ink">ID Card</p>
          <p className="mt-1 text-xs text-muted">🔒 Available after your account is approved.</p>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="mt-6 w-full rounded-xl border border-border-subtle px-4 py-3 text-xs font-bold text-ink transition hover:bg-page"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
