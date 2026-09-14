"use client";

import { useState } from "react";
import { Check, CheckCheck, Reply, Trash2, X } from "lucide-react";

function messageTime(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function replyLabel(text, type) {
  if (text) return text;
  if (type === "image") return "📷 Photo";
  if (type === "audio") return "🎤 Voice message";
  if (type === "video") return "🎥 Video";
  return "Message";
}

function ReplyPreview({ item, onJumpTo, tone }) {
  if (!item.replyToMessageId) return null;
  return (
    <button
      type="button"
      onClick={() => onJumpTo(item.replyToMessageId)}
      className={`mb-1.5 block w-full rounded-lg border-l-2 px-2 py-1 text-left text-[10px] ${tone === "mine" ? "border-white/60 bg-white/10 text-white/85" : "border-primary bg-page text-muted"}`}
    >
      <span className="block truncate">{replyLabel(item.replyToText, item.replyToMessageType)}</span>
    </button>
  );
}

function ImageContent({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block overflow-hidden rounded-xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.fileUrl} alt={item.fileName || "Photo"} loading="lazy" className="max-h-64 w-full object-cover" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setOpen(false)}>
          <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-4 text-white" aria-label="Close">
            <X className="h-6 w-6" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.fileUrl} alt={item.fileName || "Photo"} className="max-h-full max-w-full object-contain" />
        </div>
      )}
    </>
  );
}

export default function MessageBubble({ item, mine, senderName, onReply, onDelete, onJumpTo }) {
  const type = item.type || "text";

  return (
    <div id={`msg-${item.id}`} className={`group flex items-end gap-1 ${mine ? "justify-end" : "justify-start"}`}>
      {!mine && (
        <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button type="button" onClick={() => onReply(item)} className="rounded-full p-1.5 text-subtle transition hover:bg-active hover:text-primary" aria-label="Reply">
            <Reply className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <div
        className={`max-w-[75%] px-3.5 py-2.5 text-[13px] leading-5 shadow-sm transition hover:shadow-md ${mine ? "rounded-2xl rounded-br-md bg-linear-to-br from-primary to-primary-hover text-white" : "rounded-2xl rounded-bl-md border border-border-subtle bg-card text-ink"}`}
      >
        {!mine && senderName && <p className="mb-0.5 text-[10px] font-bold text-primary">{senderName}</p>}
        <ReplyPreview item={item} onJumpTo={onJumpTo} tone={mine ? "mine" : "theirs"} />

        {type === "image" && item.fileUrl && <ImageContent item={item} />}
        {type === "audio" && item.fileUrl && (
          <audio controls src={item.fileUrl} className="h-9 max-w-full" preload="metadata" />
        )}
        {type === "video" && item.fileUrl && (
          <video controls preload="metadata" src={item.fileUrl} className="max-h-64 w-full rounded-xl" />
        )}
        {item.body && <p className={`whitespace-pre-wrap break-words ${type !== "text" ? "mt-1.5" : ""}`}>{item.body}</p>}

        <span className={`mt-1 flex items-center justify-end gap-1 text-[9px] ${mine ? "text-white/70" : "text-subtle"}`}>
          {messageTime(item.createdAt)}
          {mine && (item.readAt ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
        </span>
      </div>
      <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100">
        {mine && (
          <button type="button" onClick={() => onReply(item)} className="rounded-full p-1.5 text-subtle transition hover:bg-active hover:text-primary" aria-label="Reply">
            <Reply className="h-3.5 w-3.5" />
          </button>
        )}
        {mine && (
          <button type="button" onClick={() => onDelete(item)} className="rounded-full p-1.5 text-subtle transition hover:bg-active hover:text-primary" aria-label="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
