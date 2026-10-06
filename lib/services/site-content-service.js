import { auth } from "../firebase";

async function request(options = {}, query = "") {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`/api/admin/site-content${query}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Unable to complete this request.");
  return data;
}

export const loadHero = () => request({}, "?kind=hero");
export const saveHero = (hero) => request({ method: "POST", body: JSON.stringify({ ...hero, kind: "hero" }) });
export const loadContent =(kind) => request({}, `?kind=${encodeURIComponent(kind)}`);
export const saveContent = (kind, item) => request({ method: "POST", body: JSON.stringify({ ...item, kind }) });
export const reorderContent = (ids) => request({ method: "PUT", body: JSON.stringify({ ids }) });
export const deleteContent = (id) => request({ method: "DELETE", body: JSON.stringify({ id }) });
