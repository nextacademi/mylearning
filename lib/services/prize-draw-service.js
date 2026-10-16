import { auth } from "../firebase";

async function request(url) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to complete this request.");
  return data;
}

export const loadPrizeDrawSources = () => request("/api/admin/prize-draw");

// pool: { type: "all" } | { type: "event", id, presentOnly } | { type: "training", id }
export function loadPrizePool(pool) {
  const params = new URLSearchParams({ pool: pool.type });
  if (pool.type !== "all") params.set("id", pool.id);
  if (pool.type === "event" && pool.presentOnly) params.set("present", "1");
  return request(`/api/admin/prize-draw?${params}`);
}
