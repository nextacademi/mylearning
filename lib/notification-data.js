"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, writeBatch, doc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

// Reused as-is — already fully generic (`updateDoc(notifications/{id}, {readAt})`,
// no teacher-specific logic despite living in teacher-data.js).
export { markNotificationRead } from "./teacher-data";

function ordered(snapshot) {
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((a, b) => String(b.createdAt?.toMillis?.() || "").localeCompare(String(a.createdAt?.toMillis?.() || "")));
}

// Generic twin of subscribeTeacherNotifications — usable by every role.
export function subscribeMyNotifications(uid, onData, onError) {
  if (!db || !uid) return () => {};
  return onSnapshot(
    query(collection(db, "notifications"), where("userId", "==", uid)),
    (snapshot) => onData(ordered(snapshot)),
    (error) => onError?.(error),
  );
}

// Live unread notifications of one type — e.g. the Finance "Appointments"
// tab's badge reuses the exact notifications a manager already gets pinged
// with in the bell, instead of a second unseen-tracking scheme.
export function useUnreadNotificationsByType(uid, type) {
  const [notifications, setNotifications] = useState([]);
  useEffect(() => {
    if (!uid) return undefined;
    return subscribeMyNotifications(uid, setNotifications, () => {});
  }, [uid]);
  return notifications.filter((item) => item.type === type && !item.readAt);
}

export async function markAllNotificationsRead(notifications) {
  if (!db) throw new Error("Firebase is not configured.");
  const unread = notifications.filter((item) => !item.readAt);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach((item) => batch.update(doc(db, "notifications", item.id), { readAt: serverTimestamp() }));
  await batch.commit();
}
