"use client";

import { useState } from "react";
import { Bot, X } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { useFloatingAssistantHidden } from "../../lib/fab-visibility";
import AiAssistantPanel from "./AiAssistantPanel";

// Mounted once, at the root layout, so every authenticated page gets the
// same floating assistant — not a per-role sidebar tab. Renders nothing at
// all when signed out.
export default function AiAssistantWidget() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const hidden = useFloatingAssistantHidden();

  if (loading || !user) return null;
  // The Chat workspace hides this while it's mounted so the round FAB (and
  // its panel) never overlap the message composer in the bottom-right.
  if (hidden) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open && (
        <div className="flex h-[75vh] max-h-[650px] w-[calc(100vw-2rem)] max-w-[400px] flex-col overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-2xl transition-all duration-200 ease-out sm:h-[600px]">
          <div className="flex items-center justify-between gap-2 bg-linear-to-br from-primary to-primary-hover px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20">
                <Bot className="h-4 w-4" />
              </span>
              <div>
                <b className="block text-xs">LMS AI Assistant</b>
                <span className="flex items-center gap-1 text-[9px] text-white/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                  Ready
                </span>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="rounded-full p-1 text-white/80 transition hover:bg-white/20 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <AiAssistantPanel />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close AI assistant" : "Open AI assistant"}
        className="grid h-14 w-14 place-items-center rounded-full bg-linear-to-br from-primary to-primary-hover text-white shadow-2xl transition-transform hover:scale-105 active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <Bot className="h-6 w-6" />}
      </button>
    </div>
  );
}
