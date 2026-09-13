"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

// The small "⋮" menu on each conversation row. Options differ for a group
// ("Leave Group" instead of "Delete Conversation") per the spec.
export default function ConversationMenu({ isGroup, onOpen, onMarkRead, onDelete, onLeave }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleClick(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function act(fn) {
    setOpen(false);
    fn?.();
  }

  return (
    <div ref={ref} className="relative shrink-0" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Conversation options"
        className="rounded-full p-1 text-subtle transition hover:bg-card hover:text-primary hover:shadow-sm"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-20 w-40 rounded-xl border border-border-subtle bg-card p-1 shadow-2xl">
          <button type="button" onClick={() => act(onOpen)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-ink hover:bg-page">Open</button>
          <button type="button" onClick={() => act(onMarkRead)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-ink hover:bg-page">Mark as Read</button>
          {isGroup ? (
            <button type="button" onClick={() => act(onLeave)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-primary hover:bg-active">Leave Group</button>
          ) : (
            <button type="button" onClick={() => act(onDelete)} className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-primary hover:bg-active">Delete Conversation</button>
          )}
        </div>
      )}
    </div>
  );
}
