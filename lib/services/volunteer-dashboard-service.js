import { auth } from "../firebase";

async function request(query) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`/api/volunteer-dashboard?${query}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to load the dashboard.");
  return data;
}

// Personal Volunteer Home Panel for the signed-in member.
export const loadMyVolunteerSummary = () => request("scope=me");
// Director/Admin leader console. `fresh` skips the server's 60s cache.
export const loadVolunteerOrgSummary = ({ fresh = false } = {}) => request(`scope=org${fresh ? "&refresh=1" : ""}`);
