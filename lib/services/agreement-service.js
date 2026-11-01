import { auth } from "../firebase";

async function request(query = "", options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(`/api/agreement${query}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to load the agreement.");
  return data;
}

export const loadAgreement = ({ stats = false } = {}) => request(stats ? "?stats=1" : "");
export const acceptAgreement = (version) => request("", { method: "POST", body: JSON.stringify({ version }) });
export const saveAgreement = (agreement) => request("", { method: "PUT", body: JSON.stringify(agreement) });
