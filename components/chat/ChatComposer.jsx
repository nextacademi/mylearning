"use client";

import { useEffect, useRef, useState } from "react";
import { Film, Image as ImageIcon, Mic, Paperclip, Send, Square, X } from "lucide-react";

function replyLabel(text, type) {
  if (text) return text;
  if (type === "image") return "📷 Photo";
  if (type === "audio") return "🎤 Voice message";
  if (type === "video") return "🎥 Video";
  return "Message";
}

function formatSeconds(total) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Fully controlled by ChatWorkspace (single source of truth for
// draft/attachment/upload/recording state) — this component only renders
// what it's given and reports user intent upward. The only local state is
// the tiny "is the attachment picker menu open" toggle, which is pure UI.
export default function ChatComposer({
  draft,
  onChangeDraft,
  onKeyDown,
  onSend,
  sending,
  replyTo,
  onCancelReply,
  pendingAttachment,
  onCancelAttachment,
  uploading,
  uploadProgress,
  onPickImage,
  onPickVideo,
  recorder,
  onRecordingReady,
  error,
  disableAttachments,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const textareaRef = useRef(null);

  const canSend = (draft.trim() || pendingAttachment) && !sending && !uploading && !recorder.recording;

  // Auto-grow up to ~5 lines, like Messenger's composer, then scroll
  // internally — never pushes the header/thread around.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  async function handleStopRecording() {
    const blob = await recorder.stop();
    if (blob) onRecordingReady(blob, recorder.seconds);
  }

  return (
    <div className="border-t border-border-subtle bg-card">
      {replyTo && (
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle bg-page px-4 py-2 text-xs">
          <span className="flex min-w-0 items-center gap-1.5 text-muted">
            <span className="h-full w-0.5 shrink-0 self-stretch rounded-full bg-primary" aria-hidden="true" />
            Replying to: <b className="truncate text-ink">{replyLabel(replyTo.body, replyTo.type)}</b>
          </span>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className="shrink-0 rounded-full p-1 text-subtle transition hover:bg-active hover:text-primary">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {pendingAttachment && (
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5">
          {pendingAttachment.kind === "image" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pendingAttachment.previewUrl} alt="Selected" className="h-12 w-12 rounded-xl object-cover shadow-sm" />
          )}
          {pendingAttachment.kind === "video" && (
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-page text-subtle shadow-sm">
              <Film className="h-5 w-5" />
            </span>
          )}
          {pendingAttachment.kind === "audio" && (
            <audio controls src={pendingAttachment.previewUrl} className="h-9 max-w-[220px]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-ink">
              {pendingAttachment.file.name || `Voice message (${formatSeconds(pendingAttachment.duration || 0)})`}
            </p>
            {uploading ? (
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-page">
                <div className="h-full rounded-full bg-linear-to-r from-primary to-primary-hover transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            ) : (
              <span className="text-[10px] text-subtle">Ready to send</span>
            )}
          </div>
          {!uploading && (
            <button type="button" onClick={onCancelAttachment} aria-label="Remove attachment" className="shrink-0 rounded-full p-1 text-subtle transition hover:bg-page hover:text-primary">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {error && <p className="px-4 py-2 text-[10px] font-semibold text-primary">{error}</p>}
      {recorder.error && <p className="px-4 py-2 text-[10px] font-semibold text-primary">{recorder.error}</p>}

      <div className="flex items-end gap-1.5 p-2.5">
        {recorder.recording ? (
          <div className="flex flex-1 items-center gap-3 rounded-full bg-page px-4 py-2.5">
            <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-primary" aria-hidden="true" />
            <span className="text-xs font-semibold text-ink">Recording... {formatSeconds(recorder.seconds)}</span>
            <button type="button" onClick={recorder.cancel} className="ml-auto text-xs font-bold text-subtle hover:text-primary">
              Cancel
            </button>
            <button type="button" onClick={handleStopRecording} className="flex items-center gap-1 text-xs font-bold text-primary">
              <Square className="h-3.5 w-3.5" /> Stop
            </button>
          </div>
        ) : (
          <>
            {!disableAttachments && (
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMenuOpen((value) => !value)}
                disabled={Boolean(pendingAttachment)}
                aria-label="Add attachment"
                className="grid h-9 w-9 place-items-center rounded-full text-primary transition-transform hover:scale-110 hover:bg-active active:scale-95 disabled:opacity-40"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              {menuOpen && (
                <div className="absolute bottom-12 left-0 z-10 w-40 rounded-2xl border border-border-subtle bg-card p-1.5 shadow-2xl">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      imageInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-ink hover:bg-page"
                  >
                    <ImageIcon className="h-3.5 w-3.5 text-info" /> Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      videoInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-semibold text-ink hover:bg-page"
                  >
                    <Film className="h-3.5 w-3.5 text-purple" /> Video
                  </button>
                </div>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) onPickImage(file);
                }}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) onPickVideo(file);
                }}
              />
            </div>
            )}

            {!disableAttachments && (
            <button
              type="button"
              onClick={recorder.start}
              disabled={Boolean(pendingAttachment) || !recorder.supported}
              aria-label="Record voice message"
              title={recorder.supported ? "Record voice message" : "Voice recording isn't supported in this browser"}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-primary transition-transform hover:scale-110 hover:bg-active active:scale-95 disabled:opacity-40"
            >
              <Mic className="h-4 w-4" />
            </button>
            )}

            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => onChangeDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Aa"
              rows={1}
              className="max-h-[120px] flex-1 resize-none rounded-3xl border-none bg-page px-4 py-2.5 text-[13px] leading-5 outline-none ring-1 ring-transparent transition focus:bg-card focus:ring-2 focus:ring-primary"
            />
          </>
        )}

        {!recorder.recording && (
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send message"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-linear-to-br from-primary to-primary-hover text-white shadow-sm transition-transform hover:scale-110 active:scale-90 disabled:scale-100 disabled:opacity-40"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
