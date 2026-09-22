"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import CalendarSubscribeButton from "./CalendarSubscribeButton";

// Same 3-way grouping EventManagement.jsx's own List view already uses
// (see listCategory() there) — kept in sync manually since there's no
// shared module for it yet; "Training" maps to that event type,
// "Internal" covers the one staff-only type (Meeting), everything else
// reads as a general "Event". Reuses the app's existing semantic color
// tokens so this calendar's categories look identical everywhere else
// they're shown (List view pills, filters, etc).
const CATEGORY_TONE = {
  Event: { badge: "bg-info-soft text-info", bar: "bg-info" },
  Training: { badge: "bg-success-soft text-success", bar: "bg-success" },
  Internal: { badge: "bg-purple-soft text-purple", bar: "bg-purple" },
};
function listCategory(event) {
  if (event.type === "Training") return "Training";
  if (event.type === "Meeting") return "Internal";
  return "Event";
}

const iso = (date) => date.toISOString().slice(0, 10);
const startOfWeek = (date) => { const d = new Date(date); d.setDate(d.getDate() - d.getDay()); return d; };

function eventsByDate(events) {
  const map = new Map();
  events.forEach((event) => {
    if (!event.eventDate) return;
    if (!map.has(event.eventDate)) map.set(event.eventDate, []);
    map.get(event.eventDate).push(event);
  });
  return map;
}

function CategoryLegend() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(CATEGORY_TONE).map(([name, tone]) => (
        <span key={name} className={`rounded-full px-3 py-1 text-[11px] font-bold ${tone.badge}`}>{name}</span>
      ))}
    </div>
  );
}

function EventChip({ event, onSelect }) {
  const tone = CATEGORY_TONE[listCategory(event)];
  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      title={event.name}
      className={`block w-full truncate rounded-md px-1 py-0.5 text-left text-[9px] font-bold leading-tight sm:text-[10px] ${tone.badge}`}
    >
      {event.startTime ? `${event.startTime} ` : ""}{event.name}
    </button>
  );
}

function MonthView({ cursor, byDate, onSelect }) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const gridStart = startOfWeek(firstDay);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    return date;
  });
  const today = iso(new Date());

  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="p-0.5 text-center text-[9px] font-bold uppercase tracking-wider text-subtle sm:text-[10px]">{day}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 [grid-auto-rows:56px] sm:[grid-auto-rows:70px]">
        {cells.map((date) => {
          const key = iso(date);
          const dayEvents = byDate.get(key) || [];
          const inMonth = date.getMonth() === month;
          const isToday = key === today;
          return (
            <div
              key={key}
              className={`space-y-0.5 overflow-hidden rounded-lg border p-1 sm:rounded-xl ${isToday ? "border-primary bg-active/40" : "border-border-subtle bg-card"} ${inMonth ? "" : "opacity-40"}`}
            >
              {isToday ? (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white sm:h-5 sm:w-5 sm:text-xs">{date.getDate()}</span>
              ) : (
                <p className={`text-[10px] font-bold sm:text-xs ${inMonth ? "text-ink" : "text-subtle"}`}>{date.getDate()}</p>
              )}
              <div className="space-y-0.5">
                {dayEvents.slice(0, 2).map((event) => <EventChip key={event.id} event={event} onSelect={onSelect} />)}
                {dayEvents.length > 2 && <p className="text-[8px] font-bold text-subtle sm:text-[9px]">+{dayEvents.length - 2} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ cursor, byDate, onSelect }) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
      {days.map((date) => {
        const key = iso(date);
        const dayEvents = (byDate.get(key) || []).sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
        return (
          <div key={key} className="rounded-xl border border-border-subtle bg-card p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">{date.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}</p>
            <div className="mt-2 space-y-1">
              {dayEvents.length ? dayEvents.map((event) => <EventChip key={event.id} event={event} onSelect={onSelect} />) : <p className="text-[10px] text-subtle">No events</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ cursor, byDate, onSelect }) {
  const dayEvents = (byDate.get(iso(cursor)) || []).sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  return (
    <div className="space-y-2 rounded-xl border border-border-subtle bg-card p-4">
      <p className="text-sm font-bold text-ink">{cursor.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      {dayEvents.length ? (
        <div className="space-y-2">
          {dayEvents.map((event) => {
            const tone = CATEGORY_TONE[listCategory(event)];
            return (
              <button key={event.id} type="button" onClick={() => onSelect(event)} className="flex w-full items-center justify-between rounded-xl border border-border-subtle bg-page p-3 text-left text-xs hover:bg-active/40">
                <span><b className="block text-ink">{event.name}</b><span className="text-subtle">{event.startTime}–{event.endTime} · {event.location || "No location set"}</span></span>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${tone.badge}`}>{listCategory(event)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="py-6 text-center text-sm text-subtle">No events on this day.</p>
      )}
    </div>
  );
}

function formatTime12(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return "";
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
const monthLabelFull = (key) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" }); };

// Chronological, month-grouped, Upcoming/Past + category-filterable list —
// the one shared implementation for every "list of events" surface in the
// app (this calendar's own List mode, and EventManagement's dedicated
// List tab both render this), so they can never visually drift apart.
export function EventListView({ events, onSelect }) {
  const [category, setCategory] = useState("All");
  const [when, setWhen] = useState("Upcoming");
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const grouped = useMemo(() => {
    const filtered = events.filter((event) => {
      if (!event.eventDate) return false;
      if (category !== "All" && listCategory(event) !== category) return false;
      return when === "Upcoming" ? event.eventDate >= todayIso : event.eventDate < todayIso;
    });
    filtered.sort((a, b) =>
      when === "Upcoming"
        ? a.eventDate.localeCompare(b.eventDate) || (a.startTime || "").localeCompare(b.startTime || "")
        : b.eventDate.localeCompare(a.eventDate) || (b.startTime || "").localeCompare(a.startTime || ""),
    );
    const byMonth = new Map();
    filtered.forEach((event) => {
      const key = event.eventDate.slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(event);
    });
    return [...byMonth.entries()];
  }, [events, category, when, todayIso]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {["All", "Event", "Training", "Internal"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                category === item ? "bg-primary text-white" : `${CATEGORY_TONE[item]?.badge || "bg-page text-muted"} hover:opacity-80`
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {["Upcoming", "Past"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setWhen(item)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  when === item ? "bg-active text-primary" : "border border-border-subtle bg-card text-muted hover:bg-page"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <CalendarSubscribeButton />
        </div>
      </div>

      {!grouped.length ? (
        <p className="py-10 text-center text-sm text-muted">
          No {when.toLowerCase()} events{category !== "All" ? ` in ${category}` : ""}.
        </p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([monthKey, monthEvents]) => (
            <div key={monthKey}>
              <p className="mb-2 text-sm font-bold text-ink">{monthLabelFull(monthKey)}</p>
              <div className="space-y-3">
                {monthEvents.map((event) => {
                  const cat = listCategory(event);
                  const tone = CATEGORY_TONE[cat];
                  const date = new Date(`${event.eventDate}T00:00:00`);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onSelect(event)}
                      className="flex w-full items-stretch gap-4 overflow-hidden rounded-2xl border border-border-subtle bg-card p-4 text-left shadow-sm transition hover:shadow-md"
                    >
                      <span className={`w-1 shrink-0 rounded-full ${tone.bar}`} />
                      <span className="w-12 shrink-0 text-center">
                        <span className="block text-xl font-bold text-ink">{date.getDate()}</span>
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-subtle">
                          {date.toLocaleDateString(undefined, { weekday: "short" })}
                        </span>
                      </span>
                      <span className="min-w-0 flex-1 self-center">
                        <span className="block truncate text-sm font-bold text-ink">{event.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {formatTime12(event.startTime)}{event.location ? ` · ${event.location}` : ""}
                        </span>
                      </span>
                      <span className={`shrink-0 self-center rounded-full px-2.5 py-1 text-[10px] font-bold ${tone.badge}`}>{cat}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Reusable Month / Week / Day / List calendar used by the shared Event
// Organization page (Director/Teacher/Student alike) — a light, white-card
// theme matching the rest of the app (category colors reuse the same
// semantic tokens as EventManagement's own List view) instead of a
// separate dark-navy skin. All view/date-navigation logic is unchanged.
export default function EventCalendar({ events, onSelectEvent, views = ["month", "week", "day", "list"] }) {
  const [view, setView] = useState(views[0] || "month");
  const [cursor, setCursor] = useState(() => new Date());
  const byDate = useMemo(() => eventsByDate(events), [events]);

  function shift(amount) {
    const next = new Date(cursor);
    if (view === "month") next.setMonth(next.getMonth() + amount);
    else if (view === "week") next.setDate(next.getDate() + amount * 7);
    else next.setDate(next.getDate() + amount);
    setCursor(next);
  }

  const label =
    view === "month"
      ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : view === "week"
        ? `Week of ${startOfWeek(cursor).toLocaleDateString()}`
        : view === "day"
          ? cursor.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
          : "All events";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="flex gap-1">
            {views.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setView(item)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold capitalize transition sm:px-4 sm:text-xs ${view === item ? "bg-primary text-white" : "bg-page text-muted hover:bg-active hover:text-primary"}`}
              >
                {item}
              </button>
            ))}
          </div>
          {view !== "list" && (
            <>
              <button type="button" onClick={() => setCursor(new Date())} className="rounded-full bg-primary px-3.5 py-1.5 text-[11px] font-bold text-white sm:text-xs">Today</button>
              <div className="flex items-center gap-1 rounded-xl border border-border-subtle bg-card px-1 py-1">
                <button type="button" onClick={() => shift(-1)} className="rounded-lg p-1 text-muted hover:bg-page" aria-label="Previous"><ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></button>
                <span className="px-1 text-xs font-bold text-ink sm:text-sm">{label}</span>
                <button type="button" onClick={() => shift(1)} className="rounded-lg p-1 text-muted hover:bg-page" aria-label="Next"><ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" /></button>
              </div>
            </>
          )}
        </div>
        {/* List mode has its own category filter pills (in EventListView)
              — showing this static legend too would be redundant there. */}
        {view !== "list" && <CategoryLegend />}
      </div>
      {view === "month" && <MonthView cursor={cursor} byDate={byDate} onSelect={onSelectEvent} />}
      {view === "week" && <WeekView cursor={cursor} byDate={byDate} onSelect={onSelectEvent} />}
      {view === "day" && <DayView cursor={cursor} byDate={byDate} onSelect={onSelectEvent} />}
      {view === "list" && <EventListView events={events} onSelect={onSelectEvent} />}
    </div>
  );
}
