"use client";

// Moved verbatim out of DirectorOverview.jsx (unchanged) so every new
// overview section reuses the exact same card chrome instead of duplicating
// it. `badge` is new/optional — a small real-data trend indicator (e.g.
// "+12% vs previous period") rendered next to the title; omit it when there
// isn't enough history to calculate one honestly.
export function ChartCard({ title, subtitle, icon: Icon, badge, children }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-ink">{title}</h3>
            {badge && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.startsWith("-") ? "bg-active text-primary" : "bg-success-soft text-success"}`}
              >
                {badge}
              </span>
            )}
          </div>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-active text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      {children}
    </div>
  );
}

export function EmptyChartState({ message }) {
  return <p className="grid h-70 place-items-center text-center text-sm text-muted">{message}</p>;
}

// One-line, section-scoped failure state so a single failed query never
// takes down the rest of the page (per the "isolate errors per section"
// requirement) — pairs with a Retry button wired to that section's own
// reload function.
export function ErrorChartState({ message, onRetry }) {
  return (
    <div className="grid h-70 place-items-center text-center">
      <div>
        <p className="text-sm font-semibold text-primary">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-bold text-ink hover:bg-page"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
