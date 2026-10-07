"use client";

import { useEffect, useState } from "react";
import { PlayCircle, X } from "lucide-react";
import { toVideoEmbedUrl, youTubeThumbnailUrl } from "../../lib/lesson-embed";
import trainingPhoto2 from "../../public/tranning2.jpeg";
import trainingPhoto18 from "../../public/tranning18.jpeg";
import trainingPhoto145 from "../../public/tranning145.jpeg";
import trainingPhoto195 from "../../public/tranning195.jpeg";

// "Exciting New Videos" strip. Cards are admin-managed (Dashboard → Website
// → Exciting New Videos): each has a picture and/or a YouTube, Facebook or
// Google Drive link. A card with a link opens the video in a player on
// click; a picture-only card stays a plain thumbnail. These built-in
// photos are only the fallback until the admin adds cards of their own.
const CLIPS = [
  { src: trainingPhoto2.src, title: "Microsoft Excel Training Session" },
  { src: trainingPhoto18.src, title: "PowerPoint Workshop Highlights" },
  { src: trainingPhoto145.src, title: "AutoCAD Training Session" },
  { src: trainingPhoto195.src, title: "Classroom Highlights" },
];

function VideoPlayer({ clip, onClose }) {
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={clip.title} onClick={onClose}>
      <div className="w-full max-w-4xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-4 text-white">
          <b className="truncate text-sm">{clip.title}</b>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Close video">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="aspect-video overflow-hidden rounded-xl bg-black">
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

export default function VideoLibrarySection({ clips = CLIPS }) {
  const [playing, setPlaying] = useState(null);

  return (
    <section className="bg-[#0B0D10] py-14 md:py-16">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <h2 className="text-3xl font-black tracking-[-.03em] text-white md:text-4xl">
          Exciting New Videos
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/60 md:text-base">
          A glimpse into our classrooms — hands-on sessions led by real instructors, for real learners.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {clips.map((clip) => {
            const playable = Boolean(clip.videoUrl && toVideoEmbedUrl(clip.videoUrl));
            const image = clip.src || youTubeThumbnailUrl(clip.videoUrl);
            const Card = playable ? "button" : "div";
            return (
              <Card
                key={clip.id || clip.title}
                {...(playable ? { type: "button", onClick: () => setPlaying(clip), "aria-label": `Play ${clip.title}` } : {})}
                className={`group relative block aspect-video w-full overflow-hidden rounded-xl bg-black text-left ${playable ? "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E53935]" : ""}`}
              >
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt={clip.title}
                    className="h-full w-full object-cover opacity-80 transition duration-700 group-hover:scale-105 group-hover:opacity-100"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-[#1f2937] to-[#0B0D10]" />
                )}
                <div className="absolute inset-0 bg-black/25" />
                <PlayCircle
                  className={`absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-white/90 drop-shadow transition ${playable ? "group-hover:scale-110 group-hover:text-white" : ""}`}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <p className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-xs font-bold text-white">
                  {clip.title}
                </p>
              </Card>
            );
          })}
        </div>
      </div>
      {playing && <VideoPlayer clip={playing} onClose={() => setPlaying(null)} />}
    </section>
  );
}
