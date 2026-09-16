"use client";

import { Activity, Award, CalendarDays, ScanQrCode } from "lucide-react";
import { ErrorChartState } from "./ChartCard";
import { SkeletonBar } from "../../ui/Skeleton";

// Matches one real row in either list below — an icon-in-square, two
// lines, and (for Upcoming Events) a trailing pill badge — so there's no
// layout jump when the real rows swap in.
function FeedRowSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-page p-3">
      <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-card" />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonBar className="h-3 w-2/3" />
        <SkeletonBar className="h-2.5 w-1/2" />
      </div>
    </div>
  );
}

const ACTIVITY_META = {
  "event.created": { icon: CalendarDays, bg: "bg-purple-soft", color: "text-purple" },
  "attendance.marked": { icon: Award, bg: "bg-success-soft", color: "text-success" },
  "attendance.scanned": { icon: ScanQrCode, bg: "bg-info-soft", color: "text-info" },
  "achievement.created": { icon: Award, bg: "bg-warning-soft", color: "text-warning" },
};

function timeAgo(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
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

function formatEventDate(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year) return dateStr;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

function formatEventTime(time) {
  if (!time) return "";
  const [hour, minute] = time.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${String(minute).padStart(2, "0")} ${period}`;
}

export default function EventsAndActivity({ events, eventsLoading, eventsError, onRetryEvents, activities, activitiesLoading, activitiesError, onRetryActivities }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border-subtle bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-purple-soft text-purple">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-ink">Upcoming Events</h3>
            <p className="text-xs text-muted">Next scheduled events, soonest first</p>
          </div>
        </div>
        {eventsLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <FeedRowSkeleton key={i} />)}</div>
        ) : eventsError ? (
          <ErrorChartState message="Unable to load upcoming events" onRetry={onRetryEvents} />
        ) : events?.length ? (
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="flex items-start gap-3 rounded-xl bg-page p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-card text-purple">
                  <CalendarDays className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-xs text-ink">{event.title || "Untitled event"}</b>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {formatEventDate(event.date)}
                    {event.startTime ? ` · ${formatEventTime(event.startTime)}` : ""}
                    {event.location ? ` · ${event.location}` : ""}
                  </span>
                </div>
                <span className="shrink-0 rounded-full bg-active px-2 py-1 text-[9px] font-bold uppercase text-primary">
                  {event.status || "scheduled"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted">No upcoming events</p>
        )}
      </div>

      <div className="rounded-xl border border-border-subtle bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-active text-primary">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-ink">Recent Activity</h3>
            <p className="text-xs text-muted">Real actions recorded across the academy</p>
          </div>
        </div>
        {activitiesLoading ? (
          <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <FeedRowSkeleton key={i} />)}</div>
        ) : activitiesError ? (
          <ErrorChartState message="Unable to load recent activity" onRetry={onRetryActivities} />
        ) : activities?.length ? (
          <div className="space-y-2">
            {activities.map((item) => {
              const meta = ACTIVITY_META[item.type] || { icon: Activity, bg: "bg-page", color: "text-subtle" };
              const Icon = meta.icon;
              return (
                <div key={item.id} className="flex items-start gap-3 rounded-xl bg-page p-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-card ${meta.color}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-xs text-ink">{item.title || "Activity"}</b>
                    <span className="mt-0.5 block truncate text-[11px] text-muted">{item.description}</span>
                  </div>
                  <span className="shrink-0 text-[10px] text-subtle">{timeAgo(item.createdAt)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted">No recent activity</p>
        )}
      </div>
    </div>
  );
}
