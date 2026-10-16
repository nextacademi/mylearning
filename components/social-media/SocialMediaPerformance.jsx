"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ChartNoAxesCombined, ChevronRight, Download, Eye, FileText, Heart, Loader2, RefreshCw, Settings2, Sparkles, Upload,
} from "lucide-react";
import { useToast } from "../ui/Toast";
import { loadSocialAnalytics, syncSocialMedia } from "../../lib/services/social-media-service";
import { PLATFORMS, PLATFORM_KEYS, RANGES, SCORE_EXPLAINER } from "../../lib/social-media-shared";
import {
  ChangeBadge, ChartTooltip, MetricCard, Panel, PlatformMark, RangeTabs, Sparkline, compact, downloadPostsCsv,
  formatBucketLabel, formatSyncTime, percentChange,
} from "./parts";
import { PlatformReport, PostReport } from "./PlatformReport";
import ManageSocialData from "./ManageSocialData";

const STATUS_TEXT = { ok: "Synced", partial: "Synced with warnings", error: "Failed", not_configured: "Not connected" };

function ReachTrend({ data, platforms = PLATFORM_KEYS, height = "h-72" }) {
  return (
    <div className={`${height} w-full text-subtle`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            {platforms.map((platform) => (
              <linearGradient key={platform} id={`social-fill-${platform}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PLATFORMS[platform].color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={PLATFORMS[platform].color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.2} />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => formatBucketLabel(value, "day")}
            tick={{ fontSize: 11, fill: "currentColor" }}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: "currentColor" }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip content={<ChartTooltip labelFormatter={(value) => formatBucketLabel(value, data.bucket)} />} />
          {platforms.map((platform) => (
            <Area
              key={platform}
              type="monotone"
              dataKey={platform}
              name={PLATFORMS[platform].label}
              stroke={PLATFORMS[platform].color}
              strokeWidth={2.2}
              fill={`url(#social-fill-${platform})`}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "#ffffff" }}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function PlatformShare({ byPlatform }) {
  const slices = byPlatform.filter((row) => row.views > 0).map((row) => ({ ...row, name: PLATFORMS[row.platform].label }));
  const total = slices.reduce((sum, row) => sum + row.views, 0);
  if (!total) return <p className="grid h-72 place-items-center text-sm text-muted">No views recorded in this range</p>;
  return (
    <div>
      <div className="relative h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="views" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={3} stroke="none">
              {slices.map((row) => <Cell key={row.platform} fill={PLATFORMS[row.platform].color} />)}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-2xl font-black text-ink">{compact(total)}</p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">total views</p>
          </div>
        </div>
      </div>
      <ul className="mt-4 space-y-2">
        {slices.map((row) => (
          <li key={row.platform} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: PLATFORMS[row.platform].color }} />
            <span className="flex-1 font-semibold text-ink">{row.name}</span>
            <span className="text-muted">{compact(row.views)}</span>
            <b className="w-10 text-right text-ink">{Math.round((row.views / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlatformSignals({ data, onOpen }) {
  return (
    <ul className="divide-y divide-border-subtle">
      {data.byPlatform.map((row) => (
        <li key={row.platform}>
          <button
            type="button"
            onClick={() => onOpen(row.platform)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-page"
          >
            <PlatformMark platform={row.platform} />
            <span className="min-w-0 flex-1">
              <b className="block text-sm text-ink">{PLATFORMS[row.platform].label}</b>
              <span className="block truncate text-[11px] text-muted">
                {row.followers === null ? "Followers not set" : `${compact(row.followers)} followers`} · {row.posts} post{row.posts === 1 ? "" : "s"}
              </span>
            </span>
            <span className="hidden sm:block">
              <Sparkline points={data.series.map((bucket) => bucket[row.platform])} color={PLATFORMS[row.platform].color} />
            </span>
            <span className="w-14 text-right">
              <b className="block text-sm text-ink">{compact(row.views)}</b>
              <span className="text-[10px] text-subtle">views</span>
            </span>
            <span className="hidden w-14 text-right md:block">
              <b className="block text-sm text-ink">{row.engagementRate.toFixed(1)}%</b>
              <span className="text-[10px] text-subtle">eng.</span>
            </span>
            <span className="w-12 text-right">
              <b className="block text-sm text-ink">{row.algorithmScore.toFixed(1)}</b>
              <span className="text-[10px] text-subtle">score</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

export function TopPostRow({ post, rank, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(post.id)}
      className="flex w-full items-center gap-3 rounded-xl border border-border-subtle px-3 py-2.5 text-left transition hover:border-red-line hover:bg-page"
    >
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${rank === 1 ? "bg-warning-soft text-warning" : "bg-page text-muted"}`}>
        {rank}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-bold text-ink">{post.title || "(untitled post)"}</span>
        <span className="mt-0.5 flex items-center gap-3 text-[11px] text-muted">
          <span>{post.date}</span>
          <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" aria-hidden="true" />{compact(post.views)}</span>
          <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3" aria-hidden="true" />{compact(post.likes)}</span>
        </span>
      </span>
      <span className="text-right">
        <b className="block text-sm text-ink">{post.algorithmScore.toFixed(1)}</b>
        <span className="text-[10px] text-subtle">score</span>
      </span>
    </button>
  );
}

export const topByScore = (posts, count = 3) =>
  [...posts].sort((left, right) => right.algorithmScore - left.algorithmScore || right.views - left.views).slice(0, count);

function TopPosts({ posts, onOpen }) {
  return (
    <div className="space-y-5">
      {PLATFORM_KEYS.map((platform) => {
        const top = topByScore(posts.filter((post) => post.platform === platform));
        return (
          <div key={platform}>
            <div className="mb-2 flex items-center gap-2">
              <PlatformMark platform={platform} size="sm" />
              <h4 className="text-sm font-bold text-ink">{PLATFORMS[platform].label}</h4>
            </div>
            {top.length ? (
              <div className="space-y-2">
                {top.map((post, index) => <TopPostRow key={post.id} post={post} rank={index + 1} onOpen={onOpen} />)}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border-subtle px-3 py-2.5 text-xs text-subtle">No posts in this range</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ onManage }) {
  return (
    <section className="rounded-2xl border border-dashed border-border-subtle bg-card p-8 text-center shadow-sm">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-active text-primary">
        <ChartNoAxesCombined className="h-7 w-7" aria-hidden="true" />
      </span>
      <h3 className="mt-4 text-lg font-black text-ink">No social media data yet</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
        Connect your Facebook, Instagram, TikTok and YouTube accounts for automatic syncing, or import a CSV export from each
        platform&apos;s insights page. You can also add follower counts and individual posts by hand.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => onManage("import")} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary-hover">
          <Upload className="h-4 w-4" aria-hidden="true" /> Import CSV
        </button>
        <button type="button" onClick={() => onManage("accounts")} className="inline-flex items-center gap-2 rounded-xl border border-border-subtle px-4 py-2.5 text-xs font-bold text-ink hover:bg-page">
          <Settings2 className="h-4 w-4" aria-hidden="true" /> Accounts &amp; connections
        </button>
      </div>
    </section>
  );
}

function SyncStatus({ data }) {
  const connected = PLATFORM_KEYS.filter((platform) => data?.connectors?.[platform]);
  const sync = data?.lastSync;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted" role="status">
      <span className={`h-2 w-2 rounded-full ${connected.length ? "bg-success" : "bg-subtle"}`} aria-hidden="true" />
      {connected.length
        ? `Auto-sync connected for ${connected.map((platform) => PLATFORMS[platform].label).join(", ")}`
        : "Auto-sync not connected — showing imported and manually entered data"}
      {sync?.at && <span>· Last sync {formatSyncTime(sync.at)} SGT ({STATUS_TEXT[sync.status] || sync.status})</span>}
    </p>
  );
}

export default function SocialMediaPerformance() {
  const toast = useToast();
  const [range, setRange] = useState("30d");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  // overview | platform | post | manage — sub-screens of this one sidebar tab.
  const [view, setView] = useState({ name: "overview" });
  const requestId = useRef(0);

  const load = useCallback(async (nextRange) => {
    const id = (requestId.current += 1);
    setLoading(true);
    try {
      const result = await loadSocialAnalytics(nextRange);
      if (id !== requestId.current) return;
      setData(result);
      setError("");
    } catch (err) {
      if (id === requestId.current) setError(err.message || "Unable to load social media data.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(() => load(range));
  }, [load, range]);

  const anyConnected = PLATFORM_KEYS.some((platform) => data?.connectors?.[platform]);

  async function refresh() {
    if (!anyConnected) {
      await load(range);
      return;
    }
    setSyncing(true);
    try {
      const result = await syncSocialMedia();
      const parts = Object.entries(result.platforms || {}).filter(([, item]) => item.status !== "not_configured");
      const failed = parts.filter(([, item]) => item.status === "error");
      const summary = parts
        .filter(([, item]) => item.status !== "error")
        .map(([platform, item]) => `${PLATFORMS[platform].label} ${item.posts}`)
        .join(", ");
      if (failed.length) {
        toast.warning(failed.map(([platform, item]) => `${PLATFORMS[platform].label}: ${item.message}`).join(" · "), { title: summary ? `Synced ${summary}` : "Sync failed" });
      } else {
        toast.success(`Synced ${summary} posts.`);
      }
      await load(range);
    } catch (err) {
      toast.error(err.message || "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  const totals = data?.totals;
  const previous = data?.previous;
  const hasAnyData = Boolean(data && (data.posts.length || data.byPlatform.some((row) => row.followers !== null) || data.previous.posts));
  const rangeLabel = RANGES.find((item) => item.key === range)?.label || range;
  const posts = useMemo(() => data?.posts || [], [data]);

  if (view.name === "manage") {
    return (
      <ManageSocialData
        initialTab={view.tab}
        connectors={data?.connectors || {}}
        lastSync={data?.lastSync}
        byPlatform={data?.byPlatform || []}
        onBack={() => {
          setView({ name: "overview" });
          void load(range);
        }}
      />
    );
  }
  if (view.name === "platform" && data) {
    return (
      <PlatformReport
        platform={view.platform}
        data={data}
        range={range}
        onRangeChange={setRange}
        loading={loading}
        onBack={() => setView({ name: "overview" })}
        onOpenPost={(id) => setView({ name: "post", id, from: view.platform })}
        Trend={ReachTrend}
      />
    );
  }
  if (view.name === "post" && data) {
    return (
      <PostReport
        post={posts.find((item) => item.id === view.id)}
        data={data}
        onBack={() => setView(view.from ? { name: "platform", platform: view.from } : { name: "overview" })}
        backLabel={view.from ? PLATFORMS[view.from].label : "overview"}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Analytics command center
            </p>
            <h2 className="mt-1 text-2xl font-black text-ink sm:text-3xl">Social Media Performance</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Facebook, Instagram, TikTok and YouTube in one place — reach, engagement, algorithm score and top performers.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RangeTabs value={range} onChange={setRange} />
            <button
              type="button"
              onClick={() => downloadPostsCsv(posts, `social-media-${range}`)}
              disabled={!posts.length}
              className="inline-flex items-center gap-2 rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink transition hover:bg-page disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => setView({ name: "manage", tab: "posts" })}
              className="inline-flex items-center gap-2 rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink transition hover:bg-page"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" /> Manage data
            </button>
            <button
              type="button"
              onClick={refresh}
              disabled={syncing || loading}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${syncing || loading ? "animate-spin" : ""}`} aria-hidden="true" />
              {syncing ? "Syncing…" : anyConnected ? "Sync now" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="mt-4 border-t border-border-subtle pt-3">
          {data ? <SyncStatus data={data} /> : <p className="text-[11px] text-subtle">Loading status…</p>}
        </div>
      </header>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-line bg-active px-5 py-4 text-sm text-primary" role="alert">
          <span><b>Live data is unavailable.</b> {error}</span>
          <button type="button" onClick={() => load(range)} className="rounded-lg border border-red-line px-3 py-1.5 text-xs font-bold hover:bg-card">Retry</button>
        </div>
      )}

      {!data && loading && (
        <div className="grid place-items-center rounded-2xl border border-border-subtle bg-card p-16 text-sm text-muted">
          <Loader2 className="mb-2 h-6 w-6 animate-spin text-primary" aria-hidden="true" />
          Loading social media performance…
        </div>
      )}

      {data && !hasAnyData && !loading && <EmptyState onManage={(tab) => setView({ name: "manage", tab })} />}

      {data && hasAnyData && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Summary metrics">
            <MetricCard
              label="Total views"
              value={compact(totals.views)}
              icon={Eye}
              accent="bg-info-soft text-info"
              footer={<ChangeBadge value={percentChange(totals.views, previous.views)} />}
            />
            <MetricCard
              label="Posts published"
              value={totals.posts.toLocaleString()}
              icon={FileText}
              accent="bg-warning-soft text-warning"
              footer={<span className="text-[11px] text-muted">{compact(totals.likes)} likes · {compact(totals.comments)} comments</span>}
            />
            <MetricCard
              label="Avg engagement"
              value={`${totals.engagementRate.toFixed(2)}%`}
              icon={Heart}
              accent="bg-active text-primary"
              footer={
                <ChangeBadge
                  value={previous.posts ? Number((totals.engagementRate - previous.engagementRate).toFixed(2)) : null}
                  suffix=" pts"
                />
              }
            />
            <MetricCard
              label="Algorithm score"
              value={totals.algorithmScore.toFixed(1)}
              icon={Sparkles}
              accent="bg-purple-soft text-purple"
              title={SCORE_EXPLAINER}
              footer={<span className="text-[11px] text-muted">0–100 scale · {compact(totals.shares)} shares</span>}
            />
          </section>

          <div className="grid gap-6 xl:grid-cols-3">
            <Panel
              className="xl:col-span-2"
              title="Reach trend"
              subtitle={`${data.bucket === "week" ? "Weekly" : "Daily"} views per platform, by posting date`}
              action={<span className="rounded-full bg-page px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-muted">{rangeLabel}</span>}
            >
              <ReachTrend data={data} />
            </Panel>
            <Panel title="Platform share" subtitle="Share of total views by channel">
              <PlatformShare byPlatform={data.byPlatform} />
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Panel
              title="Platform signals"
              subtitle="Views trend, engagement and algorithm score — open a platform for its full report"
              action={loading && <Loader2 className="h-4 w-4 animate-spin text-subtle" aria-label="Loading" />}
            >
              <PlatformSignals data={data} onOpen={(platform) => setView({ name: "platform", platform })} />
            </Panel>
            <Panel title="Top 3 posts per platform" subtitle="Ranked by algorithm score for this range">
              <TopPosts posts={posts} onOpen={(id) => setView({ name: "post", id })} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
