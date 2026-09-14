"use client";

// One-shot real counts for the public homepage's stat row, via the
// unauthenticated /api/public-stats route (Admin SDK server-side — see that
// route's comment for why this can't just be a client Firestore query).
// Never cached client-side beyond the browser's normal HTTP cache; always a
// fresh-ish number (route sets a 5-minute Cache-Control).
export async function loadPublicStats() {
  try {
    const response = await fetch("/api/public-stats");
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
