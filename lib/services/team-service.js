import { auth } from "../firebase";

async function request(options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch("/api/admin/team", {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Unable to complete this request.");
  return data;
}

export const loadTeam = () => request();
export const saveTeamMember = (member) => request({ method: "POST", body: JSON.stringify(member) });
export const reorderTeam = (ids) => request({ method: "PUT", body: JSON.stringify({ ids }) });
export const deleteTeamMember = (id) => request({ method: "DELETE", body: JSON.stringify({ id }) });
