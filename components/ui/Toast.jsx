"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

// The single, app-wide toast notification system. Mounted once in
// app/layout.js via <ToastProvider>; every component gets it through
// `useToast()`. Replaces all ad-hoc `window.alert(...)` success/error
// popups. For confirmations use `useConfirm()` (components/ui/ConfirmDialog).
const ToastContext = createContext(null);

const TONES = {
  success: { icon: CheckCircle2, color: "text-success" },
  error: { icon: XCircle, color: "text-primary" },
  warning: { icon: AlertTriangle, color: "text-warning" },
  info: { icon: Info, color: "text-info" },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (type, message, options = {}) => {
      const id = (idRef.current += 1);
      setToasts((list) => [...list, { id, type, message: String(message ?? ""), title: options.title || "" }]);
      const duration = options.duration ?? (type === "error" ? 6000 : 4000);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      show,
      dismiss,
      success: (message, options) => show("success", message, options),
      error: (message, options) => show("error", message, options),
      warning: (message, options) => show("warning", message, options),
      info: (message, options) => show("info", message, options),
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
        aria-live="polite"
        aria-atomic="false"
      >
        {toasts.map((toast) => {
          const tone = TONES[toast.type] || TONES.info;
          const Icon = tone.icon;
          return (
            <div
              key={toast.id}
              role="status"
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-border-subtle bg-card p-3 shadow-lg"
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.color}`} aria-hidden="true" />
              <div className="min-w-0 flex-1 text-sm">
                {toast.title && <p className="font-bold text-ink">{toast.title}</p>}
                <p className="break-words text-ink/90">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded p-0.5 text-subtle hover:bg-page hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within <ToastProvider>");
  return context;
}
