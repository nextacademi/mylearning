"use client";

import AnimatedNumber from "./AnimatedNumber";

// Same outer card classes as before this change — only the inner content
// (icon + animated number) is new; dimensions/grid/padding are untouched.
export default function StatCard({ label, value, format, icon: Icon, iconBg, iconColor, valueColor = "text-ink", loading }) {
  return (
    <article className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
      <div className="flex items-center gap-4">
        {Icon && (
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${iconBg}`}>
            <Icon className={`h-6 w-6 ${iconColor}`} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">{label}</p>
          <p className={`mt-1 text-3xl font-extrabold ${valueColor}`}>
            {loading ? <span className="text-subtle">—</span> : <AnimatedNumber value={value} format={format} />}
          </p>
        </div>
      </div>
    </article>
  );
}
