"use client";

import { useState } from "react";
import { useAuth } from "../lib/auth-context";

export default function AuthModal({ onClose, required = false }) {
  const { login, register, socialLogin, resetPassword, error, clearError } =
    useAuth();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    clearError();
    try {
      if (mode === "register") await register(email, password, name);
      else if (mode === "reset") {
        await resetPassword(email);
        setMessage("Password reset email sent. Check your inbox.");
      } else await login(email, password);
      if (mode !== "reset" && onClose) onClose();
    } catch {
      // The auth context exposes a user-facing error.
    } finally {
      setBusy(false);
    }
  }

  async function social(provider) {
    setBusy(true);
    clearError();
    try {
      await socialLogin(provider);
      if (onClose) onClose();
    } catch {
      // The auth context exposes a user-facing error.
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`${required ? "min-h-screen" : "fixed inset-0 z-20"} grid place-items-center bg-[#202b2a]/40 p-5`}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-xl bg-white p-8 text-center shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {!required && (
          <button
            onClick={onClose}
            className="absolute right-4 top-3 text-2xl text-[#9ba6a0]"
            aria-label="Close"
          >
            ×
          </button>
        )}
        <span className="mx-auto mb-4 grid h-9 w-9 place-items-center rounded-[9px_9px_9px_2px] bg-[#f17c64] font-serif text-xl text-white">
          N
        </span>
        <h2 className="font-serif text-3xl font-bold">
          {mode === "reset"
            ? "Reset password"
            : mode === "register"
              ? "Create your account"
              : "Welcome back"}
        </h2>
        <p className="my-2 mb-6 text-xs text-[#77817d]">
          {mode === "reset"
            ? "We&apos;ll send you a secure reset link."
            : "Sign in to continue your learning journey."}
        </p>
        {mode !== "reset" && (
          <div className="mb-3 grid gap-2">
            <button
              disabled={busy}
              onClick={() => social("google")}
              className="h-11 rounded-md border border-[#d8e0db] text-xs font-semibold"
            >
              Continue with Google
            </button>
            <button
              disabled={busy}
              onClick={() => social("facebook")}
              className="h-11 rounded-md border border-[#d8e0db] text-xs font-semibold"
            >
              Continue with Facebook
            </button>
          </div>
        )}
        {mode !== "reset" && (
          <div className="my-3 flex items-center gap-2 text-[10px] text-[#a6afaa]">
            <i className="h-px flex-1 bg-[#e3e8e3]" />
            or use email
            <i className="h-px flex-1 bg-[#e3e8e3]" />
          </div>
        )}
        <form onSubmit={submit} className="grid gap-2 text-left">
          {mode === "register" && (
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-11 rounded-md border border-[#d8e0db] px-3 text-xs"
              placeholder="Full name"
            />
          )}
          <input
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11 rounded-md border border-[#d8e0db] px-3 text-xs"
            placeholder="Email address"
            type="email"
          />
          {mode !== "reset" && (
            <input
              required
              minLength={4}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-11 rounded-md border border-[#d8e0db] px-3 text-xs"
              placeholder="Password (4+ characters)"
              type="password"
            />
          )}
          {(error || message) && (
            <p
              className={`text-xs ${error ? "text-red-600" : "text-[#1e6959]"}`}
            >
              {error || message}
            </p>
          )}
          <button
            disabled={busy}
            className="h-11 rounded-md bg-[#1e6959] text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy
              ? "Please wait..."
              : mode === "reset"
                ? "Send reset email"
                : mode === "register"
                  ? "Create account"
                  : "Continue with email →"}
          </button>
        </form>
        <div className="mt-4 grid gap-2 text-[11px] text-[#77817d]">
          {mode === "login" && (
            <button
              onClick={() => {
                clearError();
                setMode("reset");
              }}
              className="font-semibold text-[#1e6959]"
            >
              Forgot password?
            </button>
          )}
          {mode !== "reset" && (
            <button
              onClick={() => {
                clearError();
                setMode(mode === "login" ? "register" : "login");
              }}
              className="font-semibold text-[#1e6959]"
            >
              {mode === "login"
                ? "Create an account"
                : "Already have an account? Log in"}
            </button>
          )}
          {mode === "reset" && (
            <button
              onClick={() => {
                clearError();
                setMode("login");
              }}
              className="font-semibold text-[#1e6959]"
            >
              Back to login
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
