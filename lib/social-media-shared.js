// Shared by the Social Media Performance API (lib/server/social-media-*.js)
// and its dashboard (components/social-media/*). No imports, so it is safe
// on both sides.

export const PLATFORMS = {
  facebook: { key: "facebook", label: "Facebook", prefix: "FB", color: "#3b82f6" },
  instagram: { key: "instagram", label: "Instagram", prefix: "IG", color: "#e1306c" },
  tiktok: { key: "tiktok", label: "TikTok", prefix: "TT", color: "#10b981" },
  youtube: { key: "youtube", label: "YouTube", prefix: "YT", color: "#ef4444" },
};
export const PLATFORM_KEYS = Object.keys(PLATFORMS);
export const isPlatform = (value) => Object.prototype.hasOwnProperty.call(PLATFORMS, value);

export const RANGES = [
  { key: "7d", label: "7 days", short: "7D", days: 7 },
  { key: "30d", label: "30 days", short: "30D", days: 30 },
  { key: "6mo", label: "6 months", short: "6M", days: 182 },
  { key: "1y", label: "1 year", short: "1Y", days: 365 },
];
export const rangeDays = (key) => (RANGES.find((range) => range.key === key) || RANGES[1]).days;

// A typical organic engagement rate per platform. A post at twice its
// platform's benchmark gets full marks for engagement — see algorithmScore.
const ENGAGEMENT_BENCHMARK = { facebook: 1, instagram: 3, tiktok: 5, youtube: 4 };

export const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
export const round = (value, digits = 2) => Number(num(value).toFixed(digits));

export function engagementRate({ views, likes, comments, shares }) {
  const reach = num(views);
  return reach ? round(((num(likes) + num(comments) + num(shares)) / reach) * 100) : 0;
}

// 0–100: 60% engagement against the platform benchmark, 40% reach against
// the best post on the same platform in the same window. Used whenever a
// post has no stored algorithmScore (manual entries, imports, our own sync).
export function algorithmScore(post, maxViewsOnPlatform) {
  const benchmark = ENGAGEMENT_BENCHMARK[post.platform] || 3;
  const engagement = Math.min(num(post.engagementRate) / (benchmark * 2), 1);
  const reach = maxViewsOnPlatform > 0 ? Math.sqrt(Math.min(num(post.views) / maxViewsOnPlatform, 1)) : 0;
  return round(100 * (0.6 * engagement + 0.4 * reach), 1);
}

export const SCORE_EXPLAINER =
  "Score 0–100: engagement vs the platform's typical rate (60%) plus reach vs your best post on that platform in this range (40%).";

export function compact(value) {
  const n = num(value);
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

// Calendar day in Singapore time, matching how the rest of the app reports
// dates (lib/server/singapore-date.js).
export function sgtDate(millis) {
  return new Date(millis).toLocaleDateString("en-CA", { timeZone: "Asia/Singapore" });
}

// Post document id: "<platform>_<native id>" so a re-sync or re-import of the
// same post updates it instead of creating a duplicate.
export function postDocId(platform, externalId) {
  const clean = String(externalId || "").trim().replace(/[/\s]+/g, "-").slice(0, 120);
  return clean ? `${platform}_${clean}` : "";
}

export const CSV_COLUMNS = [
  "platform", "external_id", "posted_at", "title", "url",
  "views", "likes", "comments", "shares", "saves", "watch_time_sec", "algorithm_score",
];

// Minimal RFC 4180 parser — quoted fields, escaped quotes, CRLF, BOM.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const source = String(text || "").replace(/^﻿/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += char;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((line) => line.some((cell) => cell.trim() !== ""));
}

// CSV text → post inputs for the import API. Accepts this app's own export
// header (which uses `id`/`date_sgt`/`posted_at_iso`) as well as the
// documented import header, so an exported file can be edited and re-imported.
export function postsFromCsv(text) {
  const [header = [], ...lines] = parseCsv(text);
  const keys = header.map((cell) => cell.trim().toLowerCase());
  const pick = (cells, ...names) => {
    for (const name of names) {
      const index = keys.indexOf(name);
      if (index !== -1 && cells[index] !== undefined && cells[index].trim() !== "") return cells[index].trim();
    }
    return "";
  };
  return lines.map((cells) => {
    const platform = pick(cells, "platform").toLowerCase();
    let externalId = pick(cells, "external_id", "post_id");
    const exportedId = pick(cells, "id");
    if (!externalId && exportedId.startsWith(`${platform}_`)) externalId = exportedId.slice(platform.length + 1);
    return {
      platform,
      externalId: externalId || exportedId,
      postedAt: pick(cells, "posted_at", "posted_at_iso", "date_sgt", "date"),
      title: pick(cells, "title", "caption"),
      url: pick(cells, "url", "link"),
      views: pick(cells, "views"),
      likes: pick(cells, "likes"),
      comments: pick(cells, "comments"),
      shares: pick(cells, "shares"),
      saves: pick(cells, "saves"),
      watchTimeSec: pick(cells, "watch_time_sec"),
      algorithmScore: pick(cells, "algorithm_score"),
    };
  });
}
