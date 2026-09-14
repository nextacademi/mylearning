import { PlayCircle } from "lucide-react";

// Reference site's "video library" section, restyled to fit Next Academy:
// no confirmed YouTube channel exists for this app, so rather than
// fabricate fake video titles/thumbnails, this uses Next Academy's own
// real training photos styled as video-thumbnail cards with honest
// descriptive titles matching real course names already in this app
// (Excel/PowerPoint/AutoCAD). No "Watch on YouTube" link since there's
// nothing real to link to yet.
const CLIPS = [
  { src: "/tranning2.jpeg", title: "Microsoft Excel Training Session" },
  { src: "/tranning18.jpeg", title: "PowerPoint Workshop Highlights" },
  { src: "/tranning145.jpeg", title: "AutoCAD Training Session" },
  { src: "/tranning195.jpeg", title: "Classroom Highlights" },
];

export default function VideoLibrarySection() {
  return (
    <section className="bg-[#0B0D10] py-14 md:py-16">
      <div className="mx-auto max-w-7xl px-5 md:px-10">
        <h2 className="text-3xl font-black tracking-[-.03em] text-white md:text-4xl">
          Our training sessions
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/60 md:text-base">
          A glimpse into our classrooms — hands-on sessions led by real instructors, for real learners.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CLIPS.map((clip) => (
            <div key={clip.title} className="group relative aspect-video overflow-hidden rounded-xl bg-black">
              <img
                src={clip.src}
                alt={clip.title}
                className="h-full w-full object-cover opacity-80 transition duration-700 group-hover:scale-105 group-hover:opacity-100"
              />
              <div className="absolute inset-0 bg-black/25" />
              <PlayCircle
                className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-white/90 drop-shadow"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <p className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3 text-xs font-bold text-white">
                {clip.title}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
