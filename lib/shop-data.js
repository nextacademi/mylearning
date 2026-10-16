"use client";

import { collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db, auth } from "./firebase";

async function request(path, options = {}) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to complete this request. Please try again.");
  return data;
}

// Live product catalog — readable by any signed-in user directly via the
// client SDK (firestore.rules' `products` collection), same pattern as
// the public Event Calendar's subscribePublishedEvents.
export function subscribeProducts(onData, onError) {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, "products"),
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => onError?.(error),
  );
}

// A buyer's own order history — permitted by firestore.rules' `orders`
// read rule (`resource.data.buyerId == request.auth.uid`).
export function subscribeMyOrders(uid, onData, onError) {
  if (!db || !uid) return () => {};
  return onSnapshot(
    query(collection(db, "orders"), where("buyerId", "==", uid)),
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => onError?.(error),
  );
}

// Every order across every buyer — Admin/Director only (firestore.rules'
// `admin()` branch on `orders`), for My Shop's "Orders" view.
export function subscribeAllOrders(onData, onError) {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, "orders"),
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => onError?.(error),
  );
}

// Checkout always goes through the server (Admin SDK transaction) — see
// app/api/shop/checkout/route.js's header for why a direct client write
// can never safely decrement stock and create the order atomically.
// `extra` is new, optional, and only ever populated by the single-product
// "Place Your Order" flow (customerName/customerPhone/customerEmail/notes/
// collectionSessionId) — the existing multi-item cart checkout call site
// keeps calling checkout(items) exactly as before, sending none of it.
export const checkout = (items, extra = {}) => request("/api/shop/checkout", { method: "POST", body: JSON.stringify({ items, ...extra }) });

// Live category list — readable by any signed-in user directly via the
// client SDK (firestore.rules' `productCategories` collection), same
// pattern as subscribeProducts above.
export function subscribeCategories(onData, onError) {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, "productCategories"),
    (snapshot) => onData(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    (error) => onError?.(error),
  );
}

export const createCategory = (data) => request("/api/admin/shop/categories", { method: "POST", body: JSON.stringify(data) });
export const updateCategory = (data) => request("/api/admin/shop/categories", { method: "PATCH", body: JSON.stringify(data) });
export const deleteCategory = (id) => request("/api/admin/shop/categories", { method: "DELETE", body: JSON.stringify({ id }) });

export async function uploadCategoryImage(categoryId, file) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const form = new FormData();
  form.set("categoryId", categoryId);
  form.set("file", file);
  const response = await fetch("/api/admin/shop/categories/image", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to upload the category image.");
  return data;
}

export const createProduct = (data) => request("/api/admin/shop/products", { method: "POST", body: JSON.stringify(data) });
export const updateProduct = (data) => request("/api/admin/shop/products", { method: "PATCH", body: JSON.stringify(data) });
export const deleteProduct = (id) => request("/api/admin/shop/products", { method: "DELETE", body: JSON.stringify({ id }) });

export async function uploadProductImage(productId, file) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const form = new FormData();
  form.set("productId", productId);
  form.set("file", file);
  const response = await fetch("/api/admin/shop/products/image", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to upload the product image.");
  return data;
}

// Order status updates (e.g. marking an order fulfilled/cancelled) are
// Admin/Director-only per firestore.rules — a direct client update is
// permitted there (no transaction needed, since this never touches stock).
export async function updateOrderStatus(orderId, status) {
  if (!db) throw new Error("This feature isn't available right now.");
  await updateDoc(doc(db, "orders", orderId), { status, updatedAt: serverTimestamp() });
}

// Admin/Director changing (or clearing) an order's collection date after
// the fact — same direct-write permission as updateOrderStatus above
// (firestore.rules' `orders` update rule is admin()-only, no field
// restrictions). `date` is a plain "YYYY-MM-DD" string (or "" to clear it).
export async function updateOrderCollection(orderId, date) {
  if (!db) throw new Error("This feature isn't available right now.");
  await updateDoc(doc(db, "orders", orderId), {
    collectionDate: date || "",
    updatedAt: serverTimestamp(),
  });
}

// Admin/Director editing an order's collection date, payment method and
// notes from the Orders board — same direct-write permission as
// updateOrderStatus above. Only the keys present in `fields` are written.
export async function updateOrderDetails(orderId, fields) {
  if (!db) throw new Error("This feature isn't available right now.");
  const update = { updatedAt: serverTimestamp() };
  if ("collectionDate" in fields) update.collectionDate = fields.collectionDate || "";
  if ("paymentMethod" in fields) update.paymentMethod = String(fields.paymentMethod || "").slice(0, 60);
  if ("notes" in fields) update.notes = String(fields.notes || "").trim().slice(0, 1000);
  await updateDoc(doc(db, "orders", orderId), update);
}

// Removes an order record entirely (Admin/Director only per firestore.rules).
// The Orders board only offers this for cancelled orders, so live sales and
// pickups are never erased from the history the analytics are built on.
export async function deleteOrder(orderId) {
  if (!db) throw new Error("This feature isn't available right now.");
  await deleteDoc(doc(db, "orders", orderId));
}
