"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, HelpCircle, Loader2, X } from "lucide-react";

// The single, app-wide confirmation modal. Mounted once in app/layout.js
// via <ConfirmProvider>; components call `useConfirm()` and get an async
// `confirm(options)` function. Replaces every `window.confirm(...)` /
// `window.prompt(...)`.
//
//   const confirm = useConfirm();
//
//   // simple (drop-in for `if (!window.confirm(msg)) return;`)
//   if (!(await confirm({ title, message, tone: "danger" }))) return;
//
//   // managed loading state (spinner in the modal, closes on success,
//   // shows the error inline on failure, blocks double-submit):
//   await confirm({
//     title: "Delete record", message: "…", tone: "danger",
//     confirmLabel: "Delete",
//     onConfirm: async () => { await deleteThing(); toast.success("Deleted"); },
//   });
//
//   // with a text field (replaces window.prompt); the value is passed to
//   // onConfirm and also returned as { value }:
//   await confirm({
//     title: "Reject registration", tone: "danger", confirmLabel: "Reject",
//     input: { label: "Reason (optional)", multiline: true },
//     onConfirm: async (reason) => { await reject(reason); },
//   });
const ConfirmContext = createContext(null);

const TONES = {
  danger: { button: "bg-primary text-white hover:bg-primary-hover", icon: AlertTriangle, iconColor: "text-primary", iconBg: "bg-active" },
  success: { button: "bg-success text-white hover:opacity-90", icon: CheckCircle2, iconColor: "text-success", iconBg: "bg-success-soft" },
  neutral: { button: "bg-ink text-white hover:opacity-90", icon: HelpCircle, iconColor: "text-info", iconBg: "bg-info-soft" },
};

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { options, resolve }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [value, setValue] = useState("");
  const confirmButtonRef = useRef(null);

  const settle = useCallback((result) => {
    setState((current) => {
      current?.resolve(result);
      return null;
    });
    setBusy(false);
    setError("");
  }, []);

  const confirm = useCallback(
    (options = {}) =>
      new Promise((resolve) => {
        setBusy(false);
        setError("");
        setValue(options.input?.defaultValue || "");
        setState({ options, resolve });
      }),
    [],
  );

  const cancel = useCallback(() => {
    if (busy) return;
    settle(false);
  }, [busy, settle]);

  async function handleConfirm() {
    if (busy || !state) return;
    const { options } = state;
    const inputValue = options.input ? value : undefined;
    if (typeof options.onConfirm === "function") {
      setBusy(true);
      setError("");
      try {
        await options.onConfirm(inputValue);
        settle(options.input ? { value: inputValue } : true);
      } catch (submitError) {
        setError(submitError?.message || "Something went wrong. Please try again.");
        setBusy(false);
      }
      return;
    }
    settle(options.input ? { value: inputValue } : true);
  }

  useEffect(() => {
    if (!state) return undefined;
    function onKey(event) {
      if (event.key === "Escape" && !busy) cancel();
    }
    window.addEventListener("keydown", onKey);
    const focusTimer = setTimeout(() => confirmButtonRef.current?.focus(), 40);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(focusTimer);
    };
  }, [state, busy, cancel]);

  const api = useMemo(() => ({ confirm }), [confirm]);
  const options = state?.options || {};
  const tone = TONES[options.tone] || TONES.neutral;
  const ToneIcon = tone.icon;

  return (
    <ConfirmContext.Provider value={api}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-confirm-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) cancel();
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${tone.iconBg}`}>
                <ToneIcon className={`h-5 w-5 ${tone.iconColor}`} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="app-confirm-title" className="text-base font-bold text-ink">{options.title || "Are you sure?"}</h2>
                {options.message && <p className="mt-1 text-sm text-muted">{options.message}</p>}
              </div>
              {!busy && (
                <button type="button" onClick={cancel} aria-label="Close" className="shrink-0 rounded-lg p-1 text-subtle hover:bg-page hover:text-ink">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {options.input && (
              <label className="mt-4 block text-xs font-bold text-muted">
                {options.input.label}
                {options.input.multiline ? (
                  <textarea
                    autoFocus
                    rows={3}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={options.input.placeholder || ""}
                    maxLength={options.input.maxLength || 2000}
                    disabled={busy}
                    className="mt-1 w-full rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary disabled:bg-page"
                  />
                ) : (
                  <input
                    autoFocus
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder={options.input.placeholder || ""}
                    maxLength={options.input.maxLength || 200}
                    disabled={busy}
                    className="mt-1 w-full rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary disabled:bg-page"
                  />
                )}
              </label>
            )}

            {error && <p className="mt-3 rounded-xl bg-active px-3 py-2 text-xs font-semibold text-primary">{error}</p>}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={cancel} disabled={busy} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted hover:bg-page disabled:opacity-50">
                {options.cancelLabel || "Cancel"}
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                onClick={handleConfirm}
                disabled={busy}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-60 ${tone.button}`}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {busy ? options.pendingLabel || "Working…" : options.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used within <ConfirmProvider>");
  return context.confirm;
}
