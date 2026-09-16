// Generic, reusable "shimmer" placeholders — perceived-speed only, the
// real fetch still takes exactly as long. Swapping a bare "Loading..."
// string for a shape roughly matching the real content (a bar where a
// number goes, a card-shaped block where a card goes) reads as "this is
// arriving" much faster than plain text does, and avoids a layout jump
// when the real content replaces it. Plain Tailwind `animate-pulse`, no
// extra dependency. Compose these directly in a page's own loading
// branch — this file only holds the shared primitives, not full
// page-specific skeletons (those stay next to the real layout they mirror,
// same as TrainingCardSkeleton/TrainingRowSkeleton in
// components/training/TrainingManagement.jsx).

// `<span>` (not `<div>`), so these are valid to drop in anywhere a real
// value would go — including inside a `<p>`/`<dd>`/`<b>`, which several
// callers do (e.g. a stat tile's `<p>{loading ? <SkeletonBar/> : value}</p>`).
// A `<div>` there is invalid HTML (block content inside a `<p>` auto-closes
// it) and causes a hydration mismatch. `inline-block` keeps the same
// rectangular shimmer look since these are always explicitly sized via
// `className` (h-*/w-*) rather than relying on div's natural block sizing.
export function SkeletonBar({ className = "" }) {
  return <span className={`inline-block animate-pulse rounded bg-page align-middle ${className}`} />;
}

export function SkeletonCircle({ className = "" }) {
  return <span className={`inline-block animate-pulse rounded-full bg-page align-middle ${className}`} />;
}

// A stat/number tile: label bar + a bigger value bar.
export function SkeletonStat() {
  return (
    <div className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
      <SkeletonBar className="h-2.5 w-20" />
      <SkeletonBar className="mt-3 h-7 w-14" />
    </div>
  );
}

// A generic content card: media block + a few text lines.
export function SkeletonCard({ mediaHeight = "h-40" }) {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-sm">
      <div className={`${mediaHeight} w-full bg-page`} />
      <div className="space-y-2.5 p-4">
        <div className="h-4 w-3/4 rounded bg-page" />
        <div className="h-3 w-1/2 rounded bg-page" />
        <div className="h-3 w-2/3 rounded bg-page" />
      </div>
    </div>
  );
}

// One table/list row: a handful of bars of varying width, trailing badge.
export function SkeletonRow() {
  return (
    <div className="flex animate-pulse items-center gap-4 border-b border-border-subtle p-3">
      <div className="h-3.5 w-1/4 rounded bg-page" />
      <div className="h-3.5 w-1/6 rounded bg-page" />
      <div className="h-3.5 w-1/6 rounded bg-page" />
      <div className="ml-auto h-3.5 w-16 rounded-full bg-page" />
    </div>
  );
}

// A grid of SkeletonCard, for card-grid loading states.
export function SkeletonGrid({ count = 8, mediaHeight, className = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" }) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} mediaHeight={mediaHeight} />)}
    </div>
  );
}

// A stack of SkeletonRow, for table/list loading states.
export function SkeletonList({ count = 6 }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border-subtle">
      {Array.from({ length: count }).map((_, i) => <SkeletonRow key={i} />)}
    </div>
  );
}

// A row of SkeletonStat, for stat-card grids.
export function SkeletonStats({ count = 4, className = "grid gap-4 sm:grid-cols-2 xl:grid-cols-4" }) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, i) => <SkeletonStat key={i} />)}
    </div>
  );
}
