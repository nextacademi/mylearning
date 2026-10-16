"use client";

import { LogIn } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { useConfirm } from "../ui/ConfirmDialog";
import { canImpersonate } from "../../lib/impersonation-shared";
import { loginAsUser } from "../../lib/services/impersonation-service";

// "Log in" row button for the Users / Students / Teachers tables. Renders
// nothing unless the signed-in staff role may enter that account (see
// lib/impersonation-shared.js — the API enforces the same rule).
export default function LoginAsButton({ uid, role, name }) {
  const { profile } = useAuth();
  const confirm = useConfirm();
  if (!uid || uid === profile?.uid || !canImpersonate(profile?.role, role)) return null;

  const label = name || "this user";
  return (
    <button
      type="button"
      onClick={() => confirm({
        title: `Log in as ${label}?`,
        message: `This signs you in to ${label}'s account (${role}) — exactly as if they had logged in themselves, so anything you do (orders, registrations, messages) is done as them. Use the small ↩ button in the bottom-left corner to return to your own account. This is recorded in the access log.`,
        tone: "neutral",
        confirmLabel: "Log in as user",
        onConfirm: () => loginAsUser(uid),
      })}
      className="inline-flex items-center gap-1 rounded-lg border border-purple/30 bg-purple-soft px-2.5 py-1.5 text-[11px] font-bold text-purple hover:opacity-90"
      title={`Log in as ${label}`}
    >
      <LogIn className="h-3.5 w-3.5" aria-hidden="true" /> Log in
    </button>
  );
}
