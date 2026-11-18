"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon, Play, X } from "lucide-react";
import { isDriveUrl, isFacebookVideoUrl, isYouTubeUrl, toVideoEmbedUrl, youTubeThumbnailUrl } from "../../lib/lesson-embed";
import trainingPhoto2 from "../../public/tranning2.jpeg";
import trainingPhoto18 from "../../public/tranning18.jpeg";
import trainingPhoto145 from "../../public/tranning145.jpeg";
import trainingPhoto195 from "../../public/tranning195.jpeg";

// "Exciting New Videos" strip. Cards are admin-managed (Dashboard → Website
// → Exciting New Videos): each has a picture and/or a YouTube, Facebook or
// Google Drive link. The first video is shown large; the rest sit beside it
// as an "up next" list. A card with a link opens the video in a player on
// click; a picture-only card stays a plain thumbnail (no play button). These
// built-in photos are only the fallback until the admin adds cards.
const CLIPS = [
  { src: trainingPhoto2.src, title: "Microsoft Excel Training Session" },
  { src: trainingPhoto18.src, title: "PowerPoint Workshop Highlights" },
  { src: trainingPhoto145.src, title: "AutoCAD Training Session" },
  { src: trainingPhoto195.src, title: "Classroom Highlights" },
];

const isPlayable = (clip) => Boolean(clip.videoUrl && toVideoEmbedUrl(clip.videoUrl));

function sourceName(clip) {
  if (!isPlayable(clip)) return "";
  if (isYouTubeUrl(clip.videoUrl)) return "YouTube";
  if (isFacebookVideoUrl(clip.videoUrl)) return "Facebook";
  if (isDriveUrl(clip.videoUrl)) return "Google Drive";
  return "Video";
}

function Thumb({ clip, className = "" }) {
  const image = clip.src || youTubeThumbnailUrl(clip.videoUrl);
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt="" loading="lazy" className={`h-full w-full object-cover transition duration-700 group-hover:scale-105 ${className}`} />
  ) : (
    <div className="h-full w-full bg-gradient-to-br from-[#1f2937] to-[#0B0D10]" />
  );
}

function VideoPlayer({ clip, onClose }) {
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/85 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={clip.title} onClick={onClose}>
      <div className="w-full max-w-4xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-4 text-white">
          <b className="truncate text-base">{clip.title}</b>
          <button type="button" onClick={onClose} className="rounded-full bg-white/10 p-2 transition hover:bg-white/20" aria-label="Close video">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="aspect-video overflow-hidden rounded-xl bg-black shadow-2xl ring-1 ring-white/10">
          <iframe
            src={toVideoEmbedUrl(clip.videoUrl)}
            title={clip.title}
            className="h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}

// Button when it plays, plain block when it's a picture-only card.
function CardShell({ clip, onPlay, className, children }) {
  if (!isPlayable(clip)) return <div className={className}>{children}</div>;
  return (
    <button type="button" onClick={() => onPlay(clip)} aria-label={`Play ${clip.title}`} className={`${className} cursor-pointer text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E53935]`}>
      {children}
    </button>
  );
}

function Badge({ clip }) {
  const source = sourceName(clip);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white/85 backdrop-blur">
      {source ? <Play className="h-3 w-3 fill-current" /> : <ImageIcon className="h-3 w-3" />}
      {source || "Photo"}
    </span>
  );
}

function FeaturedCard({ clip, onPlay }) {
  const playable = isPlayable(clip);
  return (
    <CardShell clip={clip} onPlay={onPlay} className="group relative block aspect-video w-full overflow-hidden rounded-xl bg-black shadow-[0_30px_80px_-30px_rgba(229,57,53,0.5)] ring-1 ring-white/10">
      <Thumb clip={clip} className="opacity-90 group-hover:opacity-100" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />
      {playable && (
        <span className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[#E53935] text-white shadow-[0_0_0_10px_rgba(229,57,53,0.22)] transition duration-300 group-hover:scale-110 group-hover:shadow-[0_0_0_14px_rgba(229,57,53,0.28)] md:h-20 md:w-20">
          <Play className="ml-1 h-7 w-7 fill-current md:h-8 md:w-8" />
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 p-5 md:p-7">
        <Badge clip={clip} />
        <p className="mt-3 max-w-xl text-xl font-black leading-tight tracking-[-.01em] text-white md:text-3xl">{clip.title}</p>
      </div>
    </CardShell>
  );
}

function ListItem({ clip, onPlay }) {
  const playable = isPlayable(clip);
  const source = sourceName(clip);
  return (
    <CardShell clip={clip} onPlay={onPlay} className="group flex w-full items-center gap-4 rounded-xl p-2 ring-1 ring-transparent transition hover:bg-white/[0.04] hover:ring-white/10">
      <span className="relative block aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-black sm:w-44">
        <Thumb clip={clip} className="opacity-85 group-hover:opacity-100" />
        {playable && (
          <span className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition group-hover:scale-110 group-hover:bg-[#E53935]">
            <Play className="ml-0.5 h-4 w-4 fill-current" />
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="line-clamp-2 text-sm font-bold leading-snug text-white md:text-[15px]">{clip.title}</span>
        <span className="mt-1.5 block text-xs font-semibold text-white/50">
          {playable ? <><span className="text-[#F87171]">{source}</span> · Watch now</> : "Photo"}
        </span>
      </span>
    </CardShell>
  );
}

export default function VideoLibrarySection({ clips = CLIPS }) {
  const [playing, setPlaying] = useState(null);
  if (!clips.length) return null;

  // Lead with a video that actually plays; keep the admin's order otherwise.
  const leadIndex = Math.max(clips.findIndex(isPlayable), 0);
  const featured = clips[leadIndex];
  const rest = clips.filter((_, i) => i !== leadIndex);
  const videoCount = clips.filter(isPlayable).length;

  return (
    <section className="relative overflow-hidden bg-[#0B0D10] py-16 md:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(229,57,53,0.28), transparent 70%)" }}
      />
      <div className="relative mx-auto max-w-7xl px-5 md:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#F87171]">
              <span className="h-px w-6 bg-[#E53935]" aria-hidden="true" />
              Watch &amp; learn
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-.03em] text-white md:text-5xl">Exciting New Videos</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/60 md:text-base">
              A glimpse into our classrooms — hands-on sessions led by real instructors, for real learners.
            </p>
          </div>
          {videoCount > 0 && (
            <span className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-bold text-white/70">
              {videoCount} {videoCount === 1 ? "video" : "videos"}
            </span>
          )}
        </div>

        <div className={`mt-10 grid gap-6 ${rest.length ? "lg:grid-cols-[1.65fr_1fr] lg:items-start" : ""}`}>
          <FeaturedCard clip={featured} onPlay={setPlaying} />
          {rest.length > 0 && (
            <div>
              <p className="mb-2 px-2 text-xs font-bold uppercase tracking-[0.18em] text-white/40">Up next</p>
              <div className="space-y-1 lg:max-h-[26rem] lg:overflow-y-auto lg:pr-1">
                {rest.map((clip) => (
                  <ListItem key={clip.id || clip.title} clip={clip} onPlay={setPlaying} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {playing && <VideoPlayer clip={playing} onClose={() => setPlaying(null)} />}
    </section>
  );
}
