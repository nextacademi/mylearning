import "server-only";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  PLATFORM_KEYS, algorithmScore, engagementRate, isPlatform, num, postDocId, rangeDays, round, sgtDate,
} from "../social-media-shared";

// Firestore layout (server-only — never matched by firestore.rules, so the
// default deny keeps clients out; every read/write goes through
// /api/admin/social-media or the cron sync route):
//   socialMediaPosts/{platform_externalId}  one doc per post/video
//   socialMediaAccounts/{platform}          followers, handle, profile url
//   socialMediaMeta/sync                    last sync run + per-platform result
//   socialMediaMeta/tiktokAuth              rotated TikTok refresh token
const POSTS = "socialMediaPosts";
const ACCOUNTS = "socialMediaAccounts";
const DAY = 86400000;

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const isoOrNull = (value) => {
  const millis = toMillis(value);
  return millis ? new Date(millis).toISOString() : null;
};

function normalizePost(id, data) {
  const postedAt = toMillis(data.postedAt);
  const metrics = {
    views: num(data.views),
    likes: num(data.likes),
    comments: num(data.comments),
    shares: num(data.shares),
  };
  const stored = data.algorithmScore;
  return {
    id,
    platform: data.platform,
    externalId: data.externalId || id.slice(String(data.platform).length + 1),
    title: data.title || "",
    url: data.url || "",
    postedAt,
    date: data.postedDateSgt || sgtDate(postedAt),
    ...metrics,
    saves: num(data.saves),
    watchTimeSec: num(data.watchTimeSec),
    engagementRate: engagementRate(metrics),
    storedScore: stored === null || stored === undefined || stored === "" ? null : num(stored),
    source: data.source || "manual",
  };
}

// Fills algorithmScore on every post: the stored score when the data source
// supplied one, otherwise the shared formula against this window's best post
// on the same platform.
function scorePosts(posts) {
  const maxViews = {};
  posts.forEach((post) => { maxViews[post.platform] = Math.max(maxViews[post.platform] || 0, post.views); });
  return posts.map((post) => ({
    ...post,
    algorithmScore: post.storedScore ?? algorithmScore(post, maxViews[post.platform] || 0),
    scoreSource: post.storedScore === null ? "computed" : "stored",
  }));
}

function summarize(posts) {
  const sum = (key) => posts.reduce((total, post) => total + post[key], 0);
  const count = posts.length;
  return {
    posts: count,
    views: sum("views"),
    likes: sum("likes"),
    comments: sum("comments"),
    shares: sum("shares"),
    saves: sum("saves"),
    engagementRate: count ? round(sum("engagementRate") / count) : 0,
    algorithmScore: count ? round(sum("algorithmScore") / count, 1) : 0,
  };
}

// Day buckets for 7d/30d, Monday-start week buckets beyond that, zero-filled
// so the trend chart shows genuine quiet periods instead of skipping them.
function bucketKey(date, weekly) {
  if (!weekly) return date;
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

function buildSeries(posts, cutoff, now, weekly) {
  const buckets = new Map();
  const empty = (date) => ({ date, ...Object.fromEntries(PLATFORM_KEYS.map((platform) => [platform, 0])) });
  for (let at = cutoff; at <= now + DAY; at += DAY) {
    const key = bucketKey(sgtDate(Math.min(at, now)), weekly);
    if (!buckets.has(key)) buckets.set(key, empty(key));
  }
  posts.forEach((post) => {
    const key = bucketKey(post.date, weekly);
    const bucket = buckets.get(key);
    if (bucket) bucket[post.platform] += post.views;
  });
  return [...buckets.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export async function buildAnalytics(db, range) {
  const days = rangeDays(range);
  const now = Date.now();
  const cutoff = now - days * DAY;
  const previousCutoff = now - 2 * days * DAY;

  const [postsSnap, accountsSnap, syncSnap] = await Promise.all([
    db.collection(POSTS).where("postedAt", ">=", Timestamp.fromMillis(previousCutoff)).get(),
    db.collection(ACCOUNTS).get(),
    db.collection("socialMediaMeta").doc("sync").get(),
  ]);

  const all = postsSnap.docs
    .map((doc) => normalizePost(doc.id, doc.data()))
    .filter((post) => isPlatform(post.platform));
  const current = scorePosts(all.filter((post) => post.postedAt >= cutoff));
  const previous = scorePosts(all.filter((post) => post.postedAt < cutoff));

  const accounts = new Map(accountsSnap.docs.map((doc) => [doc.id, doc.data()]));
  const byPlatform = PLATFORM_KEYS.map((platform) => {
    const account = accounts.get(platform) || {};
    const own = current.filter((post) => post.platform === platform);
    return {
      platform,
      ...summarize(own),
      previousViews: previous.filter((post) => post.platform === platform).reduce((total, post) => total + post.views, 0),
      followers: account.followers === undefined || account.followers === null ? null : num(account.followers),
      handle: account.handle || "",
      url: account.url || "",
      accountUpdatedAt: isoOrNull(account.updatedAt),
    };
  });

  const sync = syncSnap.exists ? syncSnap.data() : null;
  return {
    range,
    days,
    generatedAt: new Date(now).toISOString(),
    totals: summarize(current),
    previous: summarize(previous),
    byPlatform,
    bucket: days > 31 ? "week" : "day",
    series: buildSeries(current, cutoff, now, days > 31),
    posts: current
      .sort((left, right) => right.postedAt - left.postedAt)
      .map(({ storedScore, ...post }) => ({ ...post, postedAt: new Date(post.postedAt).toISOString() })),
    lastSync: sync
      ? { at: isoOrNull(sync.lastSyncedAt), status: sync.status || "unknown", platforms: sync.platforms || {} }
      : null,
  };
}

const text = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const metric = (value) => {
  if (value === "" || value === null || value === undefined) return 0;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : NaN;
};

// One post input (manual form, CSV row, or connector) → Firestore fields, or
// an error message. Shared by every write path so they all validate alike.
export function validatePostInput(input) {
  const platform = String(input.platform || "").trim().toLowerCase();
  if (!isPlatform(platform)) return { error: `Unknown platform "${input.platform || ""}".` };
  const externalId = String(input.externalId ?? "").trim();
  const id = postDocId(platform, externalId);
  if (!id) return { error: "Post ID is required." };
  const postedAt = toMillis(input.postedAt);
  if (!postedAt) return { error: "Posted date is missing or invalid." };
  if (postedAt > Date.now() + DAY) return { error: "Posted date is in the future." };

  const fields = {};
  for (const key of ["views", "likes", "comments", "shares", "saves", "watchTimeSec"]) {
    const value = metric(input[key]);
    if (Number.isNaN(value)) return { error: `${key} must be a whole, non-negative number.` };
    fields[key] = value;
  }
  let score = null;
  if (input.algorithmScore !== "" && input.algorithmScore !== null && input.algorithmScore !== undefined) {
    score = Number(input.algorithmScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) return { error: "Algorithm score must be between 0 and 100." };
    score = round(score, 1);
  }
  const url = text(input.url, 500);
  if (url && !/^https?:\/\//i.test(url)) return { error: "Link must start with http:// or https://." };

  return {
    id,
    data: {
      platform,
      externalId: id.slice(platform.length + 1),
      title: text(input.title, 300),
      url,
      postedAt: Timestamp.fromMillis(postedAt),
      postedDateSgt: sgtDate(postedAt),
      ...fields,
      algorithmScore: score,
    },
  };
}

export async function upsertPosts(db, inputs, { source, uid }) {
  const errors = [];
  const writes = [];
  inputs.forEach((input, index) => {
    const result = validatePostInput(input || {});
    if (result.error) errors.push({ row: index + 1, message: result.error });
    else writes.push(result);
  });
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach(({ id, data }) => {
      batch.set(db.collection(POSTS).doc(id), {
        ...data,
        source,
        updatedBy: uid || null,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
  }
  return { saved: writes.length, errors };
}

export async function listAllPosts(db) {
  const snapshot = await db.collection(POSTS).orderBy("postedAt", "desc").limit(2000).get();
  return snapshot.docs
    .map((doc) => normalizePost(doc.id, doc.data()))
    .filter((post) => isPlatform(post.platform))
    .map(({ storedScore, ...post }) => ({ ...post, algorithmScore: storedScore, postedAt: new Date(post.postedAt).toISOString() }));
}

export async function deletePost(db, id) {
  if (typeof id !== "string" || !id || id.includes("/")) return false;
  const ref = db.collection(POSTS).doc(id);
  if (!(await ref.get()).exists) return false;
  await ref.delete();
  return true;
}

export async function saveAccount(db, input, { source, uid }) {
  const platform = String(input.platform || "").toLowerCase();
  if (!isPlatform(platform)) return { error: "Unknown platform." };
  const followers = input.followers === "" || input.followers === null || input.followers === undefined ? null : metric(input.followers);
  if (Number.isNaN(followers)) return { error: "Followers must be a whole, non-negative number." };
  // Only fields actually supplied are written, so a sync that can't read a
  // handle/link (or followers) never wipes one an admin typed in.
  const data = { platform, source, updatedBy: uid || null, updatedAt: FieldValue.serverTimestamp() };
  if ("handle" in input) data.handle = text(input.handle, 120);
  if ("url" in input) {
    const url = text(input.url, 500);
    if (url && !/^https?:\/\//i.test(url)) return { error: "Profile link must start with http:// or https://." };
    data.url = url;
  }
  if (followers !== null) data.followers = followers;
  await db.collection(ACCOUNTS).doc(platform).set(data, { merge: true });
  return { ok: true };
}
