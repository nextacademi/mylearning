"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { fetchLessonContentBlobUrl } from "../../lib/services/lesson-content-service";
import { isDriveUrl, isYouTubeUrl, toDriveEmbedUrl, toYouTubeEmbedUrl } from "../../lib/lesson-embed";

// Renders one lesson's actual content, by contentType. Shared by the
// Student learning view and a Teacher/Admin "Preview" action, so what an
// author sees when previewing is exactly what a student would see.
//
// YouTube/Drive URLs are rendered ONLY as an iframe embed src — never as
// visible/clickable text — per the "don't show the raw URL" requirement.
// Uploaded video/pdf/document content is fetched as an authenticated blob
// (see lib/services/lesson-content-service.js) and played/viewed entirely
// from that local blob URL; there is no HTTP Range/206 support, so the file
// downloads once up front rather than streaming progressively — an accepted
// trade-off given the 100MB video cap this feature enforces server-side.
export default function LessonContentViewer({ courseId, moduleId, lesson }) {
  const needsBlob =
    (lesson.contentType === "pdf" || lesson.contentType === "document") ||
    (lesson.contentType === "video" && !isYouTubeUrl(lesson.contentUrl) && !isDriveUrl(lesson.contentUrl));
  // Keyed by lesson.id so a lesson switch is instantly recognisable as
  // "not loaded for this lesson yet" during render, with no synchronous
  // setState in the effect body (the fetch's own .then/.catch callbacks are
  // the only place blob state changes).
  const [blob, setBlob] = useState({ forId: "", error: "", url: "", type: "" });
  const showLoading = needsBlob && blob.forId !== lesson.id;

  useEffect(() => {
    if (!needsBlob) return undefined;
    let cancelled = false;
    let objectUrl = "";
    fetchLessonContentBlobUrl(courseId, moduleId, lesson.id)
      .then((result) => {
        if (cancelled) {
          URL.revokeObjectURL(result.url);
          return;
        }
        objectUrl = result.url;
        setBlob({ forId: lesson.id, error: "", url: result.url, type: result.type });
      })
      .catch((error) => {
        if (!cancelled) setBlob({ forId: lesson.id, error: error.message || "Unable to load this content.", url: "", type: "" });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [courseId, moduleId, lesson.id, needsBlob]);

  if (lesson.contentType === "text") {
    return (
      <div className="prose prose-sm max-w-none rounded-2xl border border-border-subtle bg-card p-6">
        <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{lesson.textBody || "No notes for this lesson yet."}</p>
      </div>
    );
  }

  if (lesson.contentType === "quiz") {
    return (
      <div className="grid place-items-center rounded-2xl border border-dashed border-border-subtle bg-card p-12 text-center">
        <p className="text-sm font-bold text-ink">Quiz coming soon</p>
        <p className="mt-1 text-xs text-muted">This lesson type isn&apos;t available to take yet.</p>
      </div>
    );
  }

  if (lesson.contentType === "link") {
    return (
      <div className="grid place-items-center rounded-2xl border border-border-subtle bg-card p-12 text-center">
        <p className="mb-4 text-sm text-muted">This lesson links to an external resource.</p>
        <a
          href={lesson.contentUrl || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-white hover:bg-primary-hover"
        >
          Open resource <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    );
  }

  if (lesson.contentType === "video") {
    if (isYouTubeUrl(lesson.contentUrl)) {
      const src = toYouTubeEmbedUrl(lesson.contentUrl);
      return src ? (
        <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
          <iframe src={src} title={lesson.title} className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
        </div>
      ) : (
        <p className="text-sm text-primary">This video link could not be read.</p>
      );
    }
    if (isDriveUrl(lesson.contentUrl)) {
      const src = toDriveEmbedUrl(lesson.contentUrl);
      return src ? (
        <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
          <iframe src={src} title={lesson.title} className="h-full w-full" allow="autoplay" allowFullScreen />
        </div>
      ) : (
        <p className="text-sm text-primary">This video link could not be read.</p>
      );
    }
  }

  // Uploaded video, pdf, or document — all served via the authenticated blob.
  if (showLoading) {
    return <div className="grid aspect-video place-items-center rounded-2xl border border-border-subtle bg-card"><p className="text-xs text-muted">Loading content...</p></div>;
  }
  if (blob.error) {
    return <div className="grid aspect-video place-items-center rounded-2xl border border-dashed border-red-line bg-card"><p className="px-6 text-center text-sm text-primary">{blob.error}</p></div>;
  }
  if (lesson.contentType === "video") {
    return (
      <video controls preload="metadata" className="aspect-video w-full rounded-2xl bg-black" src={blob.url}>
        Your browser does not support video playback.
      </video>
    );
  }
  return <iframe title={lesson.title} src={blob.url} className="h-[70vh] w-full rounded-2xl border border-border-subtle bg-page" />;
}
