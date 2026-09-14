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

export const loadFinanceOverview = (range = {}) => {
  const params = new URLSearchParams();
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  const query = params.toString();
  return request(`/api/admin/finance${query ? `?${query}` : ""}`);
};

export const loadExpenses = (range = {}) => {
  const params = new URLSearchParams();
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  const query = params.toString();
  return request(`/api/admin/expenses${query ? `?${query}` : ""}`);
};
export const createExpense = (expense) => request("/api/admin/expenses", { method: "POST", body: JSON.stringify(expense) });
export const updateExpense = (id, expense) => request("/api/admin/expenses", { method: "PATCH", body: JSON.stringify({ id, ...expense }) });
export const deleteExpense = (id) => request("/api/admin/expenses", { method: "DELETE", body: JSON.stringify({ id }) });

// Manual academy income (Finance → Income). Same server route pattern as
// expenses — every mutation is authorized server-side by /api/admin/finance/income.
export const loadIncome = (range = {}) => {
  const params = new URLSearchParams();
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  const query = params.toString();
  return request(`/api/admin/finance/income${query ? `?${query}` : ""}`);
};
export const createIncome = (income) => request("/api/admin/finance/income", { method: "POST", body: JSON.stringify(income) });
export const updateIncome = (id, income) => request("/api/admin/finance/income", { method: "PATCH", body: JSON.stringify({ id, ...income }) });
export const deleteIncome = (id) => request("/api/admin/finance/income", { method: "DELETE", body: JSON.stringify({ id }) });

// Asset register (Finance → Assets) — what the academy owns and what it's
// worth (furniture, equipment, deposits, renovation), separate from the
// expense/income ledgers. Same server route pattern as expenses/income.
export const loadAssets = () => request("/api/admin/assets");
export const createAsset = (asset) => request("/api/admin/assets", { method: "POST", body: JSON.stringify(asset) });
export const updateAsset = (id, asset) => request("/api/admin/assets", { method: "PATCH", body: JSON.stringify({ id, ...asset }) });
export const deleteAsset = (id) => request("/api/admin/assets", { method: "DELETE", body: JSON.stringify({ id }) });
