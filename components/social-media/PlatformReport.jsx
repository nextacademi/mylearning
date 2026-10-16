"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ArrowLeft, Bookmark, ChevronDown, ChevronUp, ChevronsUpDown, Download, ExternalLink, Eye, Heart, MessageCircle, Share2, Sparkles,
} from "lucide-react";
import { PLATFORMS, SCORE_EXPLAINER } from "../../lib/social-media-shared";
import {
  ChangeBadge, ChartTooltip, MetricCard, Panel, PlatformMark, RangeTabs, compact, downloadPostsCsv, formatPostDate, percentChange,
} from "./parts";

function BackLink({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-xs font-bold text-muted transition hover:text-primary">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to {label}
    </button>
  );
}

const POST_COLUMNS = [
  { key: "postedAt", label: "Posted" },
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "engagementRate", label: "Eng. %" },
  { key: "algorithmScore", label: "Score" },
];

export function PlatformReport({ platform, data, range, onRangeChange, loading, onBack, onOpenPost, Trend }) {
  const meta = PLATFORMS[platform];
  const row = data.byPlatform.find((item) => item.platform === platform);
  const posts = useMemo(() => data.posts.filter((post) => post.platform === platform), [data.posts, platform]);
  const [sort, setSort] = useState({ key: "postedAt", dir: "desc" });
  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...posts].sort((a, b) => (a[sort.key] > b[sort.key] ? dir : a[sort.key] < b[sort.key] ? -dir : 0));
  }, [posts, sort]);
  const toggle = (key) => setSort((current) => ({ key, dir: current.key === key && current.dir === "desc" ? "asc" : "desc" }));

  return (
    <div className="space-y-6">
      <BackLink onClick={onBack} label="overview" />
      <header className="flex flex-col gap-5 rounded-2xl border border-border-subtle bg-card p-5 shadow-sm md:p-6 xl:flex-row xl:items-center xl:justify-between" style={{ borderTop: `4px solid ${meta.color}` }}>
        <div className="flex items-center gap-4">
          <PlatformMark platform={platform} size="lg" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-subtle">Platform report</p>
            <h2 className="text-2xl font-black text-ink">{meta.label}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <span>{row.followers === null ? "Followers not set" : `${row.followers.toLocaleString()} followers`}</span>
              <span>· {posts.length} post{posts.length === 1 ? "" : "s"} in range</span>
              {row.url && (
                <a href={row.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                  {row.handle || "Open profile"} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangeTabs value={range} onChange={onRangeChange} short />
          <button
            type="button"
            onClick={() => downloadPostsCsv(posts, `${platform}-${range}`)}
            disabled={!posts.length}
            className="inline-flex items-center gap-2 rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink hover:bg-page disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" /> Export
          </button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Views" value={compact(row.views)} icon={Eye} accent="bg-info-soft text-info" footer={<ChangeBadge value={percentChange(row.views, row.previousViews)} />} />
        <MetricCard label="Engagement rate" value={`${row.engagementRate.toFixed(2)}%`} icon={Heart} accent="bg-active text-primary"
          footer={<span className="text-[11px] text-muted">{compact(row.likes)} likes · {compact(row.comments)} comments · {compact(row.shares)} shares</span>} />
        <MetricCard label="Algorithm score" value={row.algorithmScore.toFixed(1)} icon={Sparkles} accent="bg-purple-soft text-purple" title={SCORE_EXPLAINER}
          footer={<span className="text-[11px] text-muted">Average across posts · 0–100</span>} />
        <MetricCard label="Avg views / post" value={compact(row.posts ? row.views / row.posts : 0)} icon={Share2} accent="bg-warning-soft text-warning"
          footer={<span className="text-[11px] text-muted">{row.posts} post{row.posts === 1 ? "" : "s"} published</span>} />
      </section>

      <Panel title="Views over time" subtitle={`${data.bucket === "week" ? "Weekly" : "Daily"} views on ${meta.label}, by posting date`} action={loading && <span className="text-xs text-subtle">Loading…</span>}>
        <Trend data={data} platforms={[platform]} height="h-64" />
      </Panel>

      <Panel title="All posts in range" subtitle="Click a column to sort · click a post for its full report">
        {sorted.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-border-subtle text-[10px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-3 py-2.5 font-bold">Post</th>
                  {POST_COLUMNS.map((col) => {
                    const Icon = sort.key !== col.key ? ChevronsUpDown : sort.dir === "asc" ? ChevronUp : ChevronDown;
                    return (
                      <th key={col.key} className="px-3 py-2.5 text-right font-bold">
                        <button type="button" onClick={() => toggle(col.key)} className="inline-flex items-center gap-1 uppercase hover:text-ink">
                          {col.label}<Icon className={`h-3 w-3 ${sort.key === col.key ? "" : "opacity-40"}`} aria-hidden="true" />
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {sorted.map((post) => (
                  <tr key={post.id} onClick={() => onOpenPost(post.id)} className="cursor-pointer transition hover:bg-page">
                    <td className="max-w-72 px-3 py-2.5">
                      <span className="block truncate font-semibold text-ink">{post.title || "(untitled post)"}</span>
                      <span className="font-mono text-[10px] text-subtle">{post.externalId}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-muted">{formatPostDate(post.postedAt)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-ink">{post.views.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-muted">{post.likes.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-muted">{post.comments.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-muted">{post.shares.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right text-muted">{post.engagementRate.toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-ink">{post.algorithmScore.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-10 text-center text-sm text-muted">No {meta.label} posts in this range.</p>
        )}
      </Panel>
    </div>
  );
}

// How far above/below the platform's average (same range) a post landed.
function Versus({ value, average, suffix = "" }) {
  if (!average) return <span className="text-[11px] text-subtle">No average to compare</span>;
  const diff = Math.round(((value - average) / average) * 100);
  return (
    <span className={`text-[11px] font-bold ${diff >= 0 ? "text-success" : "text-primary"}`}>
      {diff >= 0 ? "+" : ""}{diff}% vs platform avg ({typeof average === "number" ? `${compact(average)}${suffix}` : average})
    </span>
  );
}

export function PostReport({ post, data, onBack, backLabel }) {
  if (!post) {
    return (
      <div className="space-y-6">
        <BackLink onClick={onBack} label={backLabel} />
        <section className="rounded-2xl border border-border-subtle bg-card p-8 text-center text-sm text-muted shadow-sm">
          This post isn&apos;t in the selected range any more. Widen the range or go back to the overview.
        </section>
      </div>
    );
  }
  const meta = PLATFORMS[post.platform];
  const row = data.byPlatform.find((item) => item.platform === post.platform);
  const avgViews = row.posts ? row.views / row.posts : 0;
  const interactions = [
    { name: "Likes", value: post.likes, color: "#e11d48" },
    { name: "Comments", value: post.comments, color: "#f97316" },
    { name: "Shares", value: post.shares, color: "#9333ea" },
    { name: "Saves", value: post.saves, color: "#0ea5e9" },
  ];

  return (
    <div className="space-y-6">
      <BackLink onClick={onBack} label={backLabel} />
      <header className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-card p-5 shadow-sm md:flex-row md:items-center md:p-6" style={{ borderTop: `4px solid ${meta.color}` }}>
        <PlatformMark platform={post.platform} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-subtle">Post report · {meta.label}</p>
          <h2 className="mt-0.5 text-xl font-black text-ink">{post.title || "(untitled post)"}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>Posted {formatPostDate(post.postedAt)}</span>
            <code className="rounded bg-page px-1.5 py-0.5 font-mono text-[10px]">{post.externalId}</code>
            <span className="capitalize">Source: {post.source}</span>
            {post.url && (
              <a href={post.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                Open original <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            )}
          </p>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Views" value={post.views.toLocaleString()} icon={Eye} accent="bg-info-soft text-info" footer={<Versus value={post.views} average={avgViews} />} />
        <MetricCard label="Engagement rate" value={`${post.engagementRate.toFixed(2)}%`} icon={Heart} accent="bg-active text-primary"
          footer={<Versus value={post.engagementRate} average={row.engagementRate} suffix="%" />} />
        <MetricCard label="Algorithm score" value={post.algorithmScore.toFixed(1)} icon={Sparkles} accent="bg-purple-soft text-purple" title={SCORE_EXPLAINER}
          footer={<span className="text-[11px] text-muted">{post.scoreSource === "stored" ? "Score supplied by the data source" : "Calculated · 0–100"}</span>} />
        <MetricCard label="Interactions" value={(post.likes + post.comments + post.shares + post.saves).toLocaleString()} icon={MessageCircle} accent="bg-warning-soft text-warning"
          footer={<span className="text-[11px] text-muted">Likes, comments, shares and saves</span>} />
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Interaction breakdown" subtitle="How people responded to this post">
          <div className="h-64 w-full text-subtle">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={interactions} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.2} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "currentColor" }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "currentColor" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "currentColor", fillOpacity: 0.06 }} />
                <Bar dataKey="value" name="Count" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {interactions.map((item) => <Cell key={item.name} fill={item.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="At a glance" subtitle="Raw numbers for this post">
          <dl className="space-y-3 text-sm">
            {[
              [Eye, "Views", post.views],
              [Heart, "Likes", post.likes],
              [MessageCircle, "Comments", post.comments],
              [Share2, "Shares", post.shares],
              [Bookmark, "Saves", post.saves],
            ].map(([Icon, label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 border-b border-border-subtle pb-2 last:border-0">
                <dt className="flex items-center gap-2 text-muted"><Icon className="h-4 w-4" aria-hidden="true" />{label}</dt>
                <dd className="font-bold text-ink">{value.toLocaleString()}</dd>
              </div>
            ))}
            {post.watchTimeSec > 0 && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted">Watch time</dt>
                <dd className="font-bold text-ink">{Math.round(post.watchTimeSec / 60).toLocaleString()} min</dd>
              </div>
            )}
          </dl>
        </Panel>
      </div>
    </div>
  );
}
