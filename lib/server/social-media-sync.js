import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { PLATFORM_KEYS, num } from "../social-media-shared";
import { saveAccount, upsertPosts } from "./social-media-core";

// Pulls posts + follower counts from each platform's official API into the
// collections lib/server/social-media-core.js reads. A platform is only
// synced when its credentials are set (see .env.local.example → "Social
// Media Performance"); the rest keep whatever was imported or typed in.
const env = process.env;
const DAY = 86400000;
const MAX_PAGES = 6;
const LOOKBACK_DAYS = 366;
const GRAPH = () => `https://graph.facebook.com/${env.META_GRAPH_VERSION || "v23.0"}`;

export function connectorStatus() {
  return {
    facebook: Boolean(env.META_PAGE_ID && env.META_PAGE_ACCESS_TOKEN),
    instagram: Boolean(env.META_IG_USER_ID && (env.META_IG_ACCESS_TOKEN || env.META_PAGE_ACCESS_TOKEN)),
    tiktok: Boolean(env.TIKTOK_ACCESS_TOKEN || (env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET && env.TIKTOK_REFRESH_TOKEN)),
    youtube: Boolean(env.YOUTUBE_API_KEY && env.YOUTUBE_CHANNEL_ID),
  };
}

// Tokens always travel in headers, never in a URL, so they can't end up in
// an error message or a log line.
async function getJson(url, init = {}) {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(20000) });
  const raw = await response.text();
  let data = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = null; }
  if (!response.ok) {
    const message = data?.error?.message || data?.error_description || data?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return data;
}

const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
const firstLine = (value) => String(value || "").split("\n").find((line) => line.trim())?.trim().slice(0, 300) || "";

async function mapLimit(items, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

// ---- YouTube Data API v3 (API key + channel id; public statistics) --------
async function syncYouTube(cutoff) {
  const yt = (path, params) =>
    getJson(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams(params)}`, { headers: { "X-goog-api-key": env.YOUTUBE_API_KEY } });

  const channel = (await yt("channels", { part: "snippet,statistics,contentDetails", id: env.YOUTUBE_CHANNEL_ID })).items?.[0];
  if (!channel) throw new Error("Channel not found — check YOUTUBE_CHANNEL_ID.");
  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;

  const ids = [];
  let pageToken = "";
  for (let page = 0; page < MAX_PAGES && uploads; page += 1) {
    const list = await yt("playlistItems", { part: "contentDetails", playlistId: uploads, maxResults: "50", ...(pageToken ? { pageToken } : {}) });
    let reachedCutoff = false;
    for (const item of list.items || []) {
      const publishedAt = Date.parse(item.contentDetails?.videoPublishedAt || "");
      if (publishedAt && publishedAt < cutoff) reachedCutoff = true;
      else if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
    }
    pageToken = list.nextPageToken;
    if (!pageToken || reachedCutoff) break;
  }

  const posts = [];
  for (let i = 0; i < ids.length; i += 50) {
    const videos = await yt("videos", { part: "snippet,statistics", id: ids.slice(i, i + 50).join(",") });
    for (const video of videos.items || []) {
      posts.push({
        externalId: video.id,
        title: video.snippet?.title,
        url: `https://www.youtube.com/watch?v=${video.id}`,
        postedAt: video.snippet?.publishedAt,
        views: video.statistics?.viewCount,
        likes: video.statistics?.likeCount,
        comments: video.statistics?.commentCount,
      });
    }
  }
  return {
    followers: channel.statistics?.hiddenSubscriberCount ? null : num(channel.statistics?.subscriberCount),
    handle: channel.snippet?.customUrl || channel.snippet?.title || "",
    url: channel.snippet?.customUrl
      ? `https://www.youtube.com/${channel.snippet.customUrl}`
      : `https://www.youtube.com/channel/${env.YOUTUBE_CHANNEL_ID}`,
    posts,
  };
}

// ---- Meta Graph API (Facebook Page + Instagram professional account) -------
// Meta keeps renaming view metrics, so each post tries metric sets in order
// and keeps the first one the API accepts. A probe on the first post decides
// whether insights are available at all (missing permission → skip them
// instead of failing N requests).
function readInsights(response) {
  const values = {};
  for (const entry of response?.data || []) values[entry.name] = num(entry.values?.[0]?.value ?? entry.total_value?.value);
  return values;
}
const viewsFrom = (values) =>
  values.views ?? values.post_media_view ?? values.post_impressions_unique ?? values.post_impressions ?? values.impressions ?? values.reach ?? 0;

async function insightsFor(ids, candidates, token) {
  const results = new Map();
  if (!ids.length) return results;
  const tryOne = async (id, order) => {
    for (const metric of order) {
      try {
        return { metric, values: readInsights(await getJson(`${GRAPH()}/${id}/insights?${new URLSearchParams({ metric })}`, bearer(token))) };
      } catch {
        // metric set not supported for this object — try the next one
      }
    }
    return null;
  };
  const probe = await tryOne(ids[0], candidates);
  if (!probe) return results;
  results.set(ids[0], probe.values);
  const preferred = [probe.metric, ...candidates.filter((metric) => metric !== probe.metric)];
  await mapLimit(ids.slice(1), 8, async (id) => {
    const found = await tryOne(id, preferred);
    if (found) results.set(id, found.values);
  });
  return results;
}

async function graphPages(firstUrl, token, keep) {
  const rows = [];
  let next = firstUrl;
  for (let page = 0; page < MAX_PAGES && next; page += 1) {
    const response = await getJson(next, bearer(token));
    let older = false;
    for (const row of response.data || []) {
      if (keep(row)) rows.push(row);
      else older = true;
    }
    next = older ? null : response.paging?.next;
  }
  return rows;
}

async function syncFacebook(cutoff) {
  const token = env.META_PAGE_ACCESS_TOKEN;
  const pageId = env.META_PAGE_ID;
  const page = await getJson(`${GRAPH()}/${pageId}?fields=name,link,followers_count,fan_count`, bearer(token));
  const fields = "id,message,created_time,permalink_url,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)";
  const raw = await graphPages(
    `${GRAPH()}/${pageId}/posts?${new URLSearchParams({ fields, limit: "50", since: String(Math.floor(cutoff / 1000)) })}`,
    token,
    (post) => Date.parse(post.created_time) >= cutoff,
  );
  const insights = await insightsFor(raw.map((post) => post.id), ["post_media_view", "post_impressions_unique", "post_impressions"], token);
  return {
    followers: num(page.followers_count ?? page.fan_count),
    handle: page.name || "",
    url: page.link || `https://www.facebook.com/${pageId}`,
    posts: raw.map((post) => ({
      externalId: post.id,
      title: firstLine(post.message),
      url: post.permalink_url,
      postedAt: post.created_time,
      views: viewsFrom(insights.get(post.id) || {}),
      likes: post.reactions?.summary?.total_count,
      comments: post.comments?.summary?.total_count,
      shares: post.shares?.count,
    })),
  };
}

async function syncInstagram(cutoff) {
  const token = env.META_IG_ACCESS_TOKEN || env.META_PAGE_ACCESS_TOKEN;
  const userId = env.META_IG_USER_ID;
  const account = await getJson(`${GRAPH()}/${userId}?fields=username,followers_count`, bearer(token));
  const fields = "id,caption,timestamp,permalink,like_count,comments_count";
  const raw = await graphPages(
    `${GRAPH()}/${userId}/media?${new URLSearchParams({ fields, limit: "50" })}`,
    token,
    (media) => Date.parse(media.timestamp) >= cutoff,
  );
  const insights = await insightsFor(raw.map((media) => media.id), ["views,shares,saved", "reach,shares,saved", "reach,saved"], token);
  return {
    followers: num(account.followers_count),
    handle: account.username ? `@${account.username}` : "",
    url: account.username ? `https://www.instagram.com/${account.username}/` : "",
    posts: raw.map((media) => {
      const values = insights.get(media.id) || {};
      return {
        externalId: media.id,
        title: firstLine(media.caption),
        url: media.permalink,
        postedAt: media.timestamp,
        views: viewsFrom(values),
        likes: media.like_count,
        comments: media.comments_count,
        shares: values.shares,
        saves: values.saved,
      };
    }),
  };
}

// ---- TikTok Display API v2 ------------------------------------------------
// Access tokens last 24h, so with client key/secret + refresh token we mint
// a fresh one each run. TikTok may rotate the refresh token; the newest one
// is kept in socialMediaMeta/tiktokAuth, unless TIKTOK_REFRESH_TOKEN itself
// has since been changed (a re-authorisation), which then wins.
async function tiktokAccessToken(db) {
  if (!env.TIKTOK_REFRESH_TOKEN) return env.TIKTOK_ACCESS_TOKEN;
  const ref = db.collection("socialMediaMeta").doc("tiktokAuth");
  const envHash = createHash("sha256").update(env.TIKTOK_REFRESH_TOKEN).digest("hex");
  const stored = (await ref.get()).data() || {};
  const refreshToken = stored.envHash === envHash && stored.refreshToken ? stored.refreshToken : env.TIKTOK_REFRESH_TOKEN;
  const response = await getJson("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      client_secret: env.TIKTOK_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response?.access_token) throw new Error(response?.error_description || "TikTok token refresh failed — re-authorise and update TIKTOK_REFRESH_TOKEN.");
  if (response.refresh_token && response.refresh_token !== refreshToken) {
    await ref.set({ refreshToken: response.refresh_token, envHash, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return response.access_token;
}

function tiktokOk(response) {
  const code = response?.error?.code;
  if (code && code !== "ok") throw new Error(response.error.message || code);
  return response;
}

async function syncTikTok(cutoff, db) {
  const token = await tiktokAccessToken(db);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const fields = "id,title,video_description,create_time,share_url,view_count,like_count,comment_count,share_count";
  const posts = [];
  let cursor;
  for (let page = 0; page < MAX_PAGES * 2; page += 1) {
    const response = tiktokOk(await getJson(`https://open.tiktokapis.com/v2/video/list/?fields=${fields}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ max_count: 20, ...(cursor ? { cursor } : {}) }),
    }));
    let older = false;
    for (const video of response.data?.videos || []) {
      const postedAt = num(video.create_time) * 1000;
      if (postedAt < cutoff) { older = true; continue; }
      posts.push({
        externalId: video.id,
        title: firstLine(video.title || video.video_description),
        url: video.share_url,
        postedAt,
        views: video.view_count,
        likes: video.like_count,
        comments: video.comment_count,
        shares: video.share_count,
      });
    }
    if (older || !response.data?.has_more) break;
    cursor = response.data.cursor;
  }

  // follower_count needs the user.info.stats scope — without it, keep the
  // last known/manual follower count instead of failing the whole sync.
  let user = null;
  try {
    user = tiktokOk(await getJson("https://open.tiktokapis.com/v2/user/info/?fields=display_name,follower_count", { headers })).data?.user;
  } catch {
    user = null;
  }
  return {
    followers: user && user.follower_count !== undefined ? num(user.follower_count) : null,
    handle: user?.display_name || "",
    url: "",
    posts,
  };
}

const CONNECTORS = { facebook: syncFacebook, instagram: syncInstagram, tiktok: syncTikTok, youtube: syncYouTube };

export async function runSocialSync(db, { uid = null, trigger = "manual" } = {}) {
  const configured = connectorStatus();
  const cutoff = Date.now() - LOOKBACK_DAYS * DAY;
  const platforms = {};

  await Promise.all(PLATFORM_KEYS.map(async (platform) => {
    if (!configured[platform]) {
      platforms[platform] = { status: "not_configured", posts: 0 };
      return;
    }
    try {
      const result = await CONNECTORS[platform](cutoff, db);
      const { saved, errors } = await upsertPosts(db, result.posts.map((post) => ({ ...post, platform })), { source: "sync", uid });
      const account = { platform };
      if (result.handle) account.handle = result.handle;
      if (result.url) account.url = result.url;
      if (result.followers !== null && result.followers !== undefined) account.followers = result.followers;
      await saveAccount(db, account, { source: "sync", uid });
      platforms[platform] = { status: errors.length ? "partial" : "ok", posts: saved, skipped: errors.length };
    } catch (error) {
      console.error("[social-sync] platform failed", { platform, message: error?.message || "unknown" });
      platforms[platform] = { status: "error", posts: 0, message: String(error?.message || "Sync failed").slice(0, 300) };
    }
  }));

  const states = Object.values(platforms).map((item) => item.status);
  const ran = states.filter((state) => state !== "not_configured");
  const status = !ran.length ? "not_configured" : ran.every((state) => state === "ok") ? "ok" : ran.some((state) => state === "ok" || state === "partial") ? "partial" : "error";

  await db.collection("socialMediaMeta").doc("sync").set({
    lastSyncedAt: FieldValue.serverTimestamp(),
    status,
    platforms,
    trigger,
    triggeredBy: uid,
  });
  return { status, platforms };
}
