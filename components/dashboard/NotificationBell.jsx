"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, CircleDollarSign, MessageCircle, UserCheck, CheckCheck, UserX } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { subscribeMyNotifications, markAllNotificationsRead, markNotificationRead } from "../../lib/notification-data";

const typeIcon = {
  message: { Icon: MessageCircle, bg: "bg-info-soft", color: "text-info" },
  payment: { Icon: CircleDollarSign, bg: "bg-success-soft", color: "text-success" },
  enrollment: { Icon: UserCheck, bg: "bg-purple-soft", color: "text-purple" },
  attendance: { Icon: CheckCheck, bg: "bg-warning-soft", color: "text-warning" },
  "account.approved": { Icon: UserCheck, bg: "bg-success-soft", color: "text-success" },
  "account.rejected": { Icon: UserX, bg: "bg-active", color: "text-primary" },
};

function timeAgo(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString();
}

// Shared list rendering — used both inside the header dropdown here and by
// the Teacher's full-page /teacher/notifications route, so the two never
// drift into two different notification designs.
export function NotificationList({ items, onItemClick, emptyMessage = "No notifications yet." }) {
  if (!items.length) {
    return <p className="px-4 py-8 text-center text-xs text-muted">{emptyMessage}</p>;
  }
  return (
    <div className="divide-y divide-border-subtle">
      {items.map((item) => {
        const meta = typeIcon[item.type] || typeIcon.message;
        const { Icon } = meta;
        const unread = !item.readAt;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onItemClick?.(item)}
            className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-page ${unread ? "bg-active/40" : "bg-card"}`}
          >
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${meta.bg}`}>
              <Icon className={`h-4 w-4 ${meta.color}`} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <b className="truncate text-xs text-ink">{item.title}</b>
                {unread && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted">{item.body}</span>
              <span className="mt-1 block text-[10px] text-subtle">{timeAgo(item.createdAt)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function NotificationBell() {
  const { user, profile } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return subscribeMyNotifications(user.uid, setNotifications, () => {});
  }, [user?.uid]);

  useEffect(() => {
    if (!open) return undefined;
    function handleClick(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Respect the Settings page's Notifications preference — real
  // notifications keep arriving in Firestore either way (nothing is lost),
  // this only controls whether the badge/BellRing draws attention to them.
  const notificationsEnabled = profile?.notificationsEnabled !== false;
  const unreadCount = notificationsEnabled ? notifications.filter((item) => !item.readAt).length : 0;
  const Icon = unreadCount > 0 ? BellRing : Bell;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-xl p-2.5 text-muted transition hover:bg-page hover:text-primary"
        aria-label="Notifications"
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-30 w-80 overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
            <b className="text-sm text-ink">Notifications</b>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllNotificationsRead(notifications)}
                className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            <NotificationList
              items={notifications.slice(0, 20)}
              onItemClick={(item) => !item.readAt && markNotificationRead(item.id)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
