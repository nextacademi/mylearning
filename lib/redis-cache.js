import "server-only";
import { Redis } from "@upstash/redis";

// Upstash's REST-based client (not ioredis/node-redis) is the deliberate
// choice here: Firebase App Hosting runs this app on Cloud Run, a scale-to-
// zero, many-short-lived-instances environment where a persistent TCP Redis
// connection pool (ioredis) would constantly reconnect and can exhaust the
// provider's connection limit under concurrent cold starts. Upstash's client
// is just HTTPS fetch calls — safe to create fresh per invocation, no
// connection lifecycle to manage.
//
// Caching is entirely OPTIONAL and self-disabling: every helper below is a
// no-op (falls through to calling the live Firestore fetcher) when these two
// env vars aren't set, so the app behaves exactly as it did before Redis was
// introduced until someone actually configures a database.
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

export const cacheEnabled = Boolean(redis);

if (!redis && process.env.NODE_ENV !== "test") {
  // Logged once at module load (not per-request) purely so a misconfigured
  // deploy is obvious in Cloud Run logs instead of silently never caching.
  console.log("[redis-cache] UPSTASH_REDIS_REST_URL/TOKEN not set — caching disabled, reading Firestore live.");
}

export async function cacheGet(key) {
  if (!redis) return undefined;
  try {
    const value = await redis.get(key);
    return value === null ? undefined : value;
  } catch (error) {
    console.warn("[redis-cache] get failed, falling back to live data", key, error?.message);
    return undefined;
  }
}

export async function cacheSet(key, value, ttlSeconds) {
  if (!redis) return;
  try {
    await redis.set(key, value, { ex: ttlSeconds });
  } catch (error) {
    console.warn("[redis-cache] set failed (non-fatal)", key, error?.message);
  }
}

export async function cacheDel(key) {
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (error) {
    console.warn("[redis-cache] del failed (non-fatal)", key, error?.message);
  }
}

// getOrSet: the one helper most call sites use. `fetcher` only ever runs on
// a cache miss (or when Redis is unreachable/unconfigured), so a Redis
// outage degrades to "every request hits Firestore" — never to an error.
export async function cached(key, ttlSeconds, fetcher) {
  const hit = await cacheGet(key);
  if (hit !== undefined) return hit;
  const value = await fetcher();
  await cacheSet(key, value, ttlSeconds);
  return value;
}
