"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { useToast } from "../ui/Toast";

// A real, working "Subscribe" button — hands Apple/Google Calendar (or a
// copied link) the live .ics feed at /api/events/calendar (every published
// academyEvents record, regenerated on each fetch — see that route). Not a
// static one-time export: subscribing means the calendar app itself
// refetches the feed on its own schedule, so newly published events keep
// showing up automatically without the visitor doing anything again.
export default function CalendarSubscribeButton() {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return undefined;
    function onOutside(event) {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    }
    function onEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  function feedUrl() {
    return `${window.location.origin}/api/events/calendar`;
  }

  function openApple() {
    window.location.href = feedUrl().replace(/^https?:/, "webcal:");
    setOpen(false);
  }

  function openGoogle() {
    window.open(`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feedUrl())}`, "_blank", "noopener,noreferrer");
    setOpen(false);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(feedUrl());
      toast.success("Calendar link copied.");
    } catch {
      toast.error("Couldn't copy the link — copy it manually from your browser.");
    }
    setOpen(false);
  }

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover"
      >
        <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
        Subscribe
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-2xl border border-border-subtle bg-card p-3 shadow-xl">
          <p className="px-1 pb-2 text-xs leading-5 text-muted">
            New events posted here show up automatically.
          </p>
          <div className="space-y-0.5">
            <button
              type="button"
              onClick={openApple}
              className="block w-full rounded-lg px-2.5 py-2 text-left text-sm font-bold text-ink hover:bg-page"
            >
              Apple Calendar
            </button>
            <button
              type="button"
              onClick={openGoogle}
              className="block w-full rounded-lg px-2.5 py-2 text-left text-sm font-bold text-ink hover:bg-page"
            >
              Google Calendar
            </button>
            <button
              type="button"
              onClick={copyLink}
              className="block w-full rounded-lg px-2.5 py-2 text-left text-sm font-bold text-ink hover:bg-page"
            >
              Copy calendar link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
