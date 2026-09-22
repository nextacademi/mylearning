import { auth } from "../firebase";

async function request(url, options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "Unable to complete this request.");
  return data;
}

export const loadPromoCodes = () => request("/api/admin/promo-codes");
export const createPromoCode = (data) => request("/api/admin/promo-codes", { method: "POST", body: JSON.stringify(data) });
export const bulkGeneratePromoCodes = (data) => request("/api/admin/promo-codes", { method: "POST", body: JSON.stringify({ ...data, bulk: true }) });
export const deletePromoCode = (id) => request("/api/admin/promo-codes", { method: "DELETE", body: JSON.stringify({ id }) });
export const redeemPromoCode = (data) => request("/api/admin/promo-codes/redeem", { method: "POST", body: JSON.stringify(data) });
