import { auth } from "../firebase";

async function request(url, options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "Unable to complete this request.");
    error.details = data;
    throw error;
  }
  return data;
}

const post = (body) => request("/api/admin/social-media", { method: "POST", body: JSON.stringify(body) });

export const loadSocialAnalytics = (range) => request(`/api/admin/social-media?range=${encodeURIComponent(range)}`);
export const loadSocialPosts = () => request("/api/admin/social-media?view=posts");
export const syncSocialMedia = () => post({ action: "sync" });
export const saveSocialPosts = (posts, source = "manual") => post({ action: "upsert", posts, source });
export const deleteSocialPost = (id) => post({ action: "delete", id });
export const saveSocialAccount = (account) => post({ action: "account", ...account });
