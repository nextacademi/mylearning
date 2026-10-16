"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { PLATFORMS, RANGES, compact } from "../../lib/social-media-shared";

export function PlatformMark({ platform, size = "md" }) {
  const meta = PLATFORMS[platform];
  if (!meta) return null;
  const sizes = { sm: "h-6 w-6 rounded-md text-[9px]", md: "h-9 w-9 rounded-xl text-[11px]", lg: "h-14 w-14 rounded-2xl text-base" };
  return (
    <span
      className={`grid shrink-0 place-items-center font-black text-white shadow-sm ${sizes[size]}`}
      style={{ background: meta.color }}
      aria-hidden="true"
    >
      {meta.prefix}
    </span>
  );
}

export function RangeTabs({ value, onChange, short = false }) {
  return (
    <div className="flex rounded-full border border-border-subtle bg-page p-1" role="tablist" aria-label="Date range">
      {RANGES.map((range) => (
        <button
          key={range.key}
          type="button"
          role="tab"
          aria-selected={value === range.key}
          onClick={() => onChange(range.key)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${value === range.key ? "bg-primary text-white shadow-sm" : "text-muted hover:text-ink"}`}
        >
          {short ? range.short : range.label}
        </button>
      ))}
    </div>
  );
}

export function Sparkline({ points = [], color, width = 112, height = 32 }) {
  if (points.length < 2 || points.every((point) => point === 0)) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }
  const max = Math.max(...points, 1);
  const step = width / (points.length - 1);
  const path = points
    .map((point, index) => `${index ? "L" : "M"}${(index * step).toFixed(1)},${(height - 2 - (point / max) * (height - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// "+12%" style change between two periods; null when there's no baseline to
// compare against honestly.
export function percentChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function ChangeBadge({ value, suffix = "%", label = "vs previous period" }) {
  if (value === null || value === undefined || Number.isNaN(value)) return <span className="text-[11px] text-subtle">No earlier data</span>;
  const up = value >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted">
      <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-bold ${up ? "bg-success-soft text-success" : "bg-active text-primary"}`}>
        <Icon className="h-3 w-3" aria-hidden="true" />
        {up ? "+" : ""}{value}{suffix}
      </span>
      {label}
    </span>
  );
}

export function MetricCard({ label, value, icon: Icon, accent = "text-primary bg-active", footer, title }) {
  return (
    <article className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm" title={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-ink">{value}</p>
        </div>
        {Icon && (
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${accent}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
      </div>
      {footer && <div className="mt-3">{footer}</div>}
    </article>
  );
}

export function Panel({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-border-subtle bg-card p-5 shadow-sm md:p-6 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export { default as ChartTooltip } from "../ui/ChartTooltip";

export function formatBucketLabel(date, bucket) {
  const parsed = new Date(`${date}T00:00:00Z`);
  const label = parsed.toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "UTC" });
  return bucket === "week" ? `Week of ${label}` : label;
}

export function formatPostDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Singapore" });
}

export function formatSyncTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-SG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Singapore" });
}

export { compact };

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// Same columns the importer accepts, so an export can be corrected in a
// spreadsheet and imported straight back.
export function downloadPostsCsv(posts, name) {
  const header = ["platform", "external_id", "posted_at", "title", "url", "views", "likes", "comments", "shares", "saves", "watch_time_sec", "engagement_rate", "algorithm_score"];
  const lines = posts.map((post) =>
    [post.platform, post.externalId, post.postedAt, post.title, post.url, post.views, post.likes, post.comments, post.shares, post.saves, post.watchTimeSec, post.engagementRate, post.algorithmScore ?? ""]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob([`﻿${[header.join(","), ...lines].join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
