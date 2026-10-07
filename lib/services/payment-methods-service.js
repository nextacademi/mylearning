import { useEffect, useState } from "react";
import { auth } from "../firebase";
import { registerCacheReset } from "../page-refresh";

// Client side of the admin-editable payment-method list
// (lib/server/payment-methods.js). Shown immediately with the Singapore
// defaults, then swapped for the saved list once it loads.
export const DEFAULT_PAYMENT_METHODS = ["Cash", "PayNow", "Bank Transfer", "NETS", "Card", "Cheque", "Other"];

async function request(options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch("/api/payment-methods", {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to load payment methods.");
  return data.methods || DEFAULT_PAYMENT_METHODS;
}

let cachedMethods = null;
registerCacheReset(() => { cachedMethods = null; });
const listeners = new Set();

export function loadPaymentMethods({ force = false } = {}) {
  if (!cachedMethods || force) {
    cachedMethods = request().catch((error) => {
      cachedMethods = null;
      throw error;
    });
  }
  return cachedMethods;
}

export async function savePaymentMethods(methods) {
  const saved = await request({ method: "PUT", body: JSON.stringify({ methods }) });
  cachedMethods = Promise.resolve(saved);
  listeners.forEach((listener) => listener(saved));
  return saved;
}

// Every payment dropdown reads this, and re-renders the moment an admin
// saves a new list (no reload needed).
export function usePaymentMethods() {
  const [methods, setMethods] = useState(DEFAULT_PAYMENT_METHODS);
  useEffect(() => {
    let cancelled = false;
    loadPaymentMethods().then((list) => { if (!cancelled) setMethods(list); }).catch(() => {});
    const listener = (list) => setMethods(list);
    listeners.add(listener);
    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, []);
  return methods;
}
