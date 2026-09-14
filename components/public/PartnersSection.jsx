// Reference site's "Our Partners" section shows real third-party company
// logos (Singtel, Ministry of Manpower, Red Cross, etc.) — those belong to
// that organization's actual partnerships and are deliberately NOT copied
// here, since displaying them on Next Academy's own site would falsely
// claim a partnership that doesn't exist. The section's visual frame is
// still built (so the design is fully in place) with placeholder slots —
// swap PLACEHOLDER_COUNT logos for real ones the moment Next Academy has
// real partners to name.
const PLACEHOLDER_COUNT = 8;

export default function PartnersSection() {
  return (
    <section className="bg-[#FAFAF7] py-14 md:py-16">
      <div className="mx-auto max-w-7xl px-5 text-center md:px-10">
        <p className="inline-flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[.2em] text-[#E53935]">
          <span className="h-[2px] w-6 bg-[#E53935]" />
          Our partners
        </p>
        <h2 className="mt-3 text-3xl font-black tracking-[-.03em] text-[#111827] md:text-4xl">
          We don&apos;t do this alone.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#6B7280] md:text-base">
          Open to working alongside organisations across Singapore who share the belief that everyone deserves a fair shot.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: PLACEHOLDER_COUNT }, (_, i) => (
            <div
              key={i}
              className="flex h-20 items-center justify-center rounded-xl border border-dashed border-[#E5E7EB] bg-white text-xs font-semibold text-[#9CA3AF]"
            >
              Your organisation here
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
