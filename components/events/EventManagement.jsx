"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarDays, Eye, EyeOff, MapPin, Pencil, Search, Trash2, UserRound, Users } from "lucide-react";
import { ChartCard, EmptyChartState } from "../dashboard/overview/ChartCard";
import EventCalendar from "./EventCalendar";
import EventForm from "./EventForm";
import CalendarSubscribeButton from "./CalendarSubscribeButton";
import DataTable, { StatusBadge as TableBadge } from "../data-table/DataTable";
import { createEvent, deleteEvent, loadEvents, setEventPublished, updateEvent, uploadEventBanner } from "../../lib/services/event-service";
import { subscribeAllEvents } from "../../lib/admin-events-data";
import { subscribePublishedEvents } from "../../lib/events-client";
import { computeEventStatus, FILTER_STATUSES } from "../../lib/events-shared";
import { useAuth } from "../../lib/auth-context";
import { db } from "../../lib/firebase";
import { SkeletonBar, SkeletonGrid } from "../ui/Skeleton";

// Same aggregate shape app/api/admin/events/route.js's buildStats() computes
// server-side for Director/Admin — mirrored here so Teacher/Student (who
// can't call that Admin-only API) still get real stat cards, computed from
// exactly the events their own role is actually allowed to see.
function buildStatsFromRows(rows) {
  const stats = { total: rows.length, upcoming: 0, ongoing: 0, completed: 0, cancelled: 0, totalParticipants: 0 };
  const byMonth = new Map();
  const byType = new Map();
  rows.forEach((row) => {
    if (row.computedStatus === "Upcoming") stats.upcoming += 1;
    else if (row.computedStatus === "Ongoing") stats.ongoing += 1;
    else if (row.computedStatus === "Completed") stats.completed += 1;
    else if (row.computedStatus === "Cancelled") stats.cancelled += 1;
    stats.totalParticipants += row.participantCount || 0;
    const month = (row.eventDate || "").slice(0, 7);
    if (month) byMonth.set(month, (byMonth.get(month) || 0) + 1);
    if (row.type) byType.set(row.type, (byType.get(row.type) || 0) + 1);
  });
  return {
    ...stats,
    byMonth: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, count]) => ({ month, count })),
    byType: [...byType.entries()].map(([type, count]) => ({ type, count })),
  };
}

const CHART_COLORS = ["#FF2D2D", "#F59E0B", "#22C55E", "#3B82F6", "#A855F7", "#14B8A6", "#EC4899", "#98A2B3"];
const statusTones = {
  Upcoming: "bg-info-soft text-info", Ongoing: "bg-success-soft text-success",
  Completed: "bg-page text-subtle", Cancelled: "bg-active text-primary", Draft: "bg-warning-soft text-warning",
};
function StatusBadge({ value }) {
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusTones[value] || "bg-page text-muted"}`}>{value}</span>;
}
function EventThumbnail({ event }) {
  return (
    <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-page">
      {event.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={event.bannerUrl} alt={event.name} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 bg-[linear-gradient(135deg,#fff5f5_0%,#ffffff_65%)] text-subtle">
          <CalendarDays className="h-7 w-7" aria-hidden="true" />
          <span className="text-[10px] font-bold uppercase tracking-widest">No thumbnail</span>
        </div>
      )}
      <span className="absolute right-2.5 top-2.5"><StatusBadge value={event.computedStatus} /></span>
      {event.type && (
        <span className="absolute bottom-2.5 left-2.5 rounded-md bg-slate-900/75 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
          {event.type}
        </span>
      )}
    </div>
  );
}

function EventCard({ event, onEdit, onTogglePublish, onDelete, canManage }) {
  const timeLabel = event.startTime ? `${event.startTime}${event.endTime ? `–${event.endTime}` : ""}` : null;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-sm transition hover:shadow-md">
      <EventThumbnail event={event} />
      <div className="flex flex-1 flex-col p-3.5">
        <h3 className="truncate text-sm font-bold text-ink" title={event.name}>{event.name}</h3>
        <div className="mt-1.5 space-y-1 text-xs text-muted">
          <p className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />
            <span className="truncate">{event.eventDate || "—"}{timeLabel ? ` · ${timeLabel}` : ""}</span>
          </p>
          {event.location && (
            <p className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />
              <span className="truncate">{event.location}</span>
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />
            {event.participantCount ?? 0}{event.maxParticipants != null ? ` / ${event.maxParticipants}` : ""} registered
          </p>
          {event.organizer && (
            <p className="flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />
              <span className="truncate">{event.organizer}</span>
            </p>
          )}
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border-subtle pt-2.5">
          <Link href={`/dashboard/events/${event.id}`} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white hover:bg-primary-hover">View</Link>
          {canManage && (
            <div className="flex items-center gap-0.5">
              <button type="button" title="Edit" aria-label="Edit event" onClick={() => onEdit(event)} className="rounded-lg p-1.5 text-muted hover:bg-active hover:text-primary">
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </button>
              <button type="button" title={event.published ? "Unpublish" : "Publish"} aria-label={event.published ? "Unpublish event" : "Publish event"} onClick={() => onTogglePublish(event)} className="rounded-lg p-1.5 text-muted hover:bg-active hover:text-info">
                {event.published ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
              <button type="button" title="Delete" aria-label="Delete event" onClick={() => onDelete(event)} className="rounded-lg p-1.5 text-muted hover:bg-active hover:text-primary">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// A simplified 3-way grouping for the chronological List view, distinct
// from the granular EVENT_TYPES (Workshop/Seminar/etc.) used everywhere
// else — derived on the fly, not a stored field, so no schema/API change
// was needed. "Training" maps directly to that same event type; "Internal"
// covers the one type that's inherently staff-only (Meeting); everything
// else reads as a general "Event".
const LIST_CATEGORY_TONE = {
  Event: { badge: "bg-info-soft text-info", bar: "bg-info" },
  Training: { badge: "bg-success-soft text-success", bar: "bg-success" },
  Internal: { badge: "bg-purple-soft text-purple", bar: "bg-purple" },
};
function listCategory(event) {
  if (event.type === "Training") return "Training";
  if (event.type === "Meeting") return "Internal";
  return "Event";
}
function formatTime12(value) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return "";
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
const monthLabelFull = (key) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" }); };

// Chronological, month-grouped list — a deliberately different presentation
// from the Table/Grid tabs (which both show every event flat, unsorted by
// time-relevance) for the common "what's coming up" glance. Reuses the same
// role-scoped, search-filtered `events` array the other tabs already get;
// only the category/Upcoming-Past split below is local to this view.
function EventListView({ events, onSelect }) {
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
                category === item ? "bg-ink text-white" : `${LIST_CATEGORY_TONE[item]?.badge || "bg-page text-muted"} hover:opacity-80`
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
                  const tone = LIST_CATEGORY_TONE[cat];
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

function Dialog({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold text-ink">{title}</h2><button type="button" onClick={onClose} className="text-xl text-muted" aria-label="Close">×</button></div>
        {children}
      </div>
    </div>
  );
}
const monthLabel = (key) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "numeric" }); };
const blankForm = { name: "", type: "", description: "", eventDate: "", startTime: "", endTime: "", location: "", organizer: "", organizerId: "", maxParticipants: "", targetAudience: [], registrationRequired: false, registrationDeadline: "", status: "", published: false };

// One shared "Event Organization" page for Director/Admin, Teacher, and
// Student/Volunteer/Facilitator. Structure, cards, colors, and Table/List/
// Grid/Calendar are IDENTICAL for every role (same component, same classes) —
// only which sections render, and which data source feeds them, changes:
//
//   Director/Admin — unchanged from before this task: loadEvents()'s
//     Admin-only API (app/api/admin/events, requireManager-gated) for
//     every event (draft + published) and its server-computed stats, plus
//     the live subscribeAllEvents() overlay. Full management (Add/Edit/
//     Publish/Delete) and both charts.
//   Teacher — can never call the Admin-only API (the server would 403 it
//     regardless of anything the UI does — see requireManager in
//     app/api/admin/events/route.js), so it reads the exact same two
//     client-side Firestore queries the pre-existing Student/organizer
//     views already used: published events (subscribePublishedEvents) plus
//     any event they organize (academyEvents where organizerId == uid,
//     the same query TeacherOrganizerEvents.jsx already ran) — allowed by
//     the existing academyEvents security rule as-is, no rule change.
//     Stats cards, no charts, no Add/Edit/Publish/Delete.
//   Student/Volunteer/Facilitator/other — published events only (same
//     query as before), a smaller stat-card set, no charts, no management.
export default function EventManagement() {
  const router = useRouter();
  const { profile, user } = useAuth();
  const role = profile?.role;
  const isDirector = role === "Director" || role === "Admin";
  const isTeacher = role === "Teacher";
  const canManage = isDirector;

  const [data, setData] = useState({ events: [], stats: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [tab, setTab] = useState("Grid");
  const [form, setForm] = useState(blankForm);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    if (!isDirector) return;
    setLoading(true);
    try {
      const result = await loadEvents();
      setData(result);
      setError("");
    } catch (loadError) {
      setData({ events: [], stats: null });
      setError(loadError.message || "Unable to load events. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [isDirector]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  // Live event list — real-time via Firestore's own onSnapshot, so a
  // create/edit/publish/delete updates every tab immediately with no
  // manual refresh. Director/Admin get every event (subscribeAllEvents,
  // unchanged); everyone else gets only what their role may actually see.
  const [liveEvents, setLiveEvents] = useState([]);
  const [liveLoading, setLiveLoading] = useState(true);
  const [publishedRows, setPublishedRows] = useState([]);
  const [organizedRows, setOrganizedRows] = useState([]);

  useEffect(() => {
    if (!isDirector) return undefined;
    return subscribeAllEvents(
      (rows) => {
        setLiveEvents(rows.map((event) => ({ ...event, computedStatus: computeEventStatus(event) })));
        setLiveLoading(false);
      },
      () => setLiveLoading(false),
    );
  }, [isDirector]);

  useEffect(() => {
    if (isDirector) return undefined;
    return subscribePublishedEvents(
      (rows) => {
        setPublishedRows(rows.map((event) => ({ ...event, computedStatus: computeEventStatus(event) })));
        setLiveLoading(false);
      },
      () => setLiveLoading(false),
    );
  }, [isDirector]);

  useEffect(() => {
    if (isDirector || !isTeacher || !db || !user?.uid) return undefined;
    return onSnapshot(
      query(collection(db, "academyEvents"), where("organizerId", "==", user.uid)),
      (snapshot) => setOrganizedRows(snapshot.docs.map((item) => {
        const event = { id: item.id, ...item.data() };
        return { ...event, computedStatus: computeEventStatus(event) };
      })),
      () => {},
    );
  }, [isDirector, isTeacher, user?.uid]);

  // Pure derivation, not an effect+setState — a non-Director's visible set
  // is just "whatever their two allowed queries returned, deduped".
  const mergedNonDirectorEvents = useMemo(() => {
    const merged = new Map();
    [...publishedRows, ...organizedRows].forEach((event) => merged.set(event.id, event));
    return [...merged.values()];
  }, [publishedRows, organizedRows]);
  const visibleEvents = isDirector ? liveEvents : mergedNonDirectorEvents;

  // Teacher/Student stat cards are a pure derivation of exactly what their
  // own role can see (visibleEvents above) — never a separate, wider fetch.
  const ownStats = useMemo(() => (isDirector ? null : buildStatsFromRows(visibleEvents)), [isDirector, visibleEvents]);
  const statsLoading = isDirector ? loading : liveLoading;

  const events = useMemo(() => visibleEvents
    .filter((event) =>
      (filter === "All" || event.computedStatus === filter) &&
      `${event.name} ${event.type} ${event.location} ${event.organizer}`.toLowerCase().includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => (a.eventDate || "").localeCompare(b.eventDate || "") || (a.startTime || "").localeCompare(b.startTime || "")),
  [visibleEvents, search, filter]);

  function selectBanner(file) {
    setBannerFile(file);
    setBannerPreview(file ? URL.createObjectURL(file) : "");
  }
  function removeBanner() {
    selectBanner(null);
    setForm((current) => ({ ...current, bannerUrl: "", bannerPath: "" }));
  }
  function open(event) {
    setEditing(event || null);
    setAdding(!event);
    setForm(
      event
        ? {
            name: event.name, type: event.type, description: event.description,
            eventDate: event.eventDate, startTime: event.startTime, endTime: event.endTime,
            location: event.location, organizer: event.organizer, organizerId: event.organizerId || "",
            maxParticipants: event.maxParticipants ?? "", targetAudience: event.targetAudience || [],
            registrationRequired: event.registrationRequired, registrationDeadline: event.registrationDeadline,
            status: event.status || "", published: event.published, bannerUrl: event.bannerUrl || "",
          }
        : { ...blankForm },
    );
    selectBanner(null);
    setFormError("");
  }
  function closeForm() {
    setEditing(null);
    setAdding(false);
    setForm(blankForm);
    selectBanner(null);
  }

  async function submit(e) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError("");
    try {
      if (editing) {
        let bannerUrl = form.bannerUrl;
        let bannerPath = form.bannerPath;
        if (bannerFile) ({ bannerUrl, bannerPath } = await uploadEventBanner(editing.id, bannerFile));
        await updateEvent({ id: editing.id, ...form, bannerUrl, bannerPath });
        setNotice("Event updated successfully.");
      } else {
        const result = await createEvent(form);
        const created = result.event;
        if (bannerFile) {
          const { bannerUrl, bannerPath } = await uploadEventBanner(created.id, bannerFile);
          await updateEvent({ id: created.id, ...form, bannerUrl, bannerPath });
        }
        setNotice(`Event "${created.name}" created successfully.`);
      }
      closeForm();
      await load();
    } catch (saveError) {
      setFormError(saveError.message || "Unable to save this event.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(event) {
    try {
      await setEventPublished(event.id, !event.published);
      setNotice(event.published ? "Event unpublished." : "Event published.");
      await load();
    } catch (toggleError) {
      setError(toggleError.message || "Unable to update publish state.");
    }
  }
  async function confirmDeleteEvent() {
    if (!confirmDelete) return;
    try {
      await deleteEvent(confirmDelete.id);
      setNotice("Event deleted.");
      setConfirmDelete(null);
      await load();
    } catch (deleteError) {
      setError(deleteError.message || "Unable to delete this event.");
    }
  }

  const stats = isDirector ? data.stats : ownStats;
  const byMonth = (stats?.byMonth || []).map((row) => ({ month: monthLabel(row.month), count: row.count }));
  const byType = stats?.byType || [];
  // Director/Admin & Teacher get the full 5-card set; a browsing role
  // (Student/Volunteer/Facilitator) only gets Upcoming/Ongoing/Completed —
  // "Total Events" and "Total Participants" are academy-wide admin metrics
  // per the role spec, not something a browsing student needs on their own
  // events list.
  const statCards = isDirector || isTeacher
    ? [["Total Events", stats?.total], ["Upcoming", stats?.upcoming], ["Ongoing", stats?.ongoing], ["Completed", stats?.completed], ["Total Participants", stats?.totalParticipants]]
    : [["Upcoming", stats?.upcoming], ["Ongoing", stats?.ongoing], ["Completed", stats?.completed]];

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 text-ink shadow-xl">
        <div><h2 className="text-3xl font-black">Events</h2><p className="mt-2 text-sm text-muted">{canManage ? "Create, publish, and manage academy-wide events, workshops, and activities." : "Browse academy events, workshops, and activities."}</p></div>
        {canManage && <button type="button" onClick={() => open(null)} className="rounded-xl bg-primary px-4 py-3 text-xs font-bold text-white">Add Event</button>}
      </section>

      {notice && <p className="rounded-xl bg-success-soft p-4 text-sm text-success">{notice}</p>}
      {error && <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>}

      <section className={`grid gap-4 sm:grid-cols-2 ${statCards.length > 3 ? "xl:grid-cols-5" : "xl:grid-cols-3"}`}>
        {statCards.map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</p>
            {statsLoading ? <SkeletonBar className="mt-2 h-7 w-14" /> : <p className="mt-2 text-2xl font-extrabold text-ink">{value ?? 0}</p>}
          </article>
        ))}
      </section>

      <div className="flex gap-2">
        {["Grid", "List", "Table", "Calendar"].map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-full px-4 py-2 text-xs font-bold transition ${tab === item ? "bg-primary text-white" : "bg-page text-muted hover:bg-active hover:text-primary"}`}>{item}</button>
        ))}
      </div>

      {tab === "Table" ? (
        <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
          <DataTable
            title="events"
            name="events"
            columns={[
              { key: "name", header: "Event", sortable: true, accessor: (e) => e.name || "", render: (e) => <b className="text-ink">{e.name}</b> },
              { key: "type", header: "Type", sortable: true, filter: {}, accessor: (e) => e.type || "" },
              { key: "eventDate", header: "Date", sortable: true, accessor: (e) => e.eventDate || "", render: (e) => <span className="text-xs">{e.eventDate || "—"}{e.startTime ? ` · ${e.startTime}${e.endTime ? `–${e.endTime}` : ""}` : ""}</span>, exportValue: (e) => e.eventDate || "" },
              { key: "location", header: "Location", accessor: (e) => e.location || "" },
              { key: "participantCount", header: "Registered", align: "right", sortable: true, accessor: (e) => e.participantCount ?? 0, render: (e) => `${e.participantCount ?? 0}${e.maxParticipants != null ? ` / ${e.maxParticipants}` : ""}`, exportValue: (e) => e.participantCount ?? 0 },
              { key: "organizer", header: "Organizer", sortable: true, accessor: (e) => e.organizer || "" },
              { key: "computedStatus", header: "Status", sortable: true, filter: {}, accessor: (e) => e.computedStatus || "", render: (e) => <TableBadge tone={{ Upcoming: "blue", Ongoing: "green", Completed: "gray", Cancelled: "red", Draft: "orange" }[e.computedStatus] || "gray"}>{e.computedStatus}</TableBadge> },
              // A non-manager's own event list is published-only by
              // construction (see the data-loading effects above), so a
              // "Published" column would read "Published" on every single
              // row — real information only for Director/Admin, who can
              // also see drafts.
              ...(canManage ? [{ key: "published", header: "Published", sortable: true, filter: {}, accessor: (e) => (e.published ? "Published" : "Draft") }] : []),
            ]}
            rows={events}
            loading={liveLoading}
            initialSort={{ key: "eventDate", dir: "desc" }}
            pageSize={10}
            emptyLabel="No events found."
            rowActions={(event) => (
              <>
                <Link href={`/dashboard/events/${event.id}`} className="rounded-lg bg-info px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90">View</Link>
                {canManage && (
                  <>
                    <button type="button" onClick={() => open(event)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-page">Edit</button>
                    <button type="button" onClick={() => togglePublish(event)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-info hover:bg-page">{event.published ? "Unpublish" : "Publish"}</button>
                    <button type="button" onClick={() => setConfirmDelete(event)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-page">Delete</button>
                  </>
                )}
              </>
            )}
          />
        </section>
      ) : tab === "List" ? (
        <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
          <EventListView events={events} onSelect={(event) => (canManage ? open(event) : router.push(`/dashboard/events/${event.id}`))} />
        </section>
      ) : tab === "Calendar" ? (
        <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
          {/* Director/Admin clicking a calendar event opens the inline
              edit dialog (fast management workflow, unchanged). Teacher/
              Student have no edit rights, so their click instead opens the
              same read-only event detail page the Table/Grid "View" link
              and Add-Event dialog both already use. */}
          <EventCalendar events={events} onSelectEvent={(event) => (canManage ? open(event) : router.push(`/dashboard/events/${event.id}`))} />
        </section>
      ) : (
        <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-wrap gap-3">
            <label className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-subtle" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search event, type, location, organizer" className="w-full rounded-xl border border-border-subtle bg-page py-2 pl-9 pr-3 text-sm" />
            </label>
            {FILTER_STATUSES.map((item) => (
              <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === item ? "bg-primary text-white" : "bg-page text-muted hover:bg-active hover:text-primary"}`}>{item}</button>
            ))}
          </div>

          {liveLoading ? (
            <SkeletonGrid count={10} mediaHeight="aspect-[4/3]" className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" />
          ) : events.length ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {events.map((event) => (
                <EventCard key={event.id} event={event} onEdit={open} onTogglePublish={togglePublish} onDelete={setConfirmDelete} canManage={canManage} />
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted">{search || filter !== "All" ? "No events match your search." : canManage ? "No events found. Click \"Add Event\" to create the first one." : "No events found."}</p>
          )}
        </section>
      )}

      {isDirector && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ChartCard title="Events by Month" subtitle="Scheduled events across the year" icon={CalendarDays}>
            {loading ? <div className="h-70 w-full animate-pulse rounded-xl bg-page" /> : byMonth.length ? (
              <div className="h-70 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byMonth} margin={{ top: 8, right: 16, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#667085" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#667085" }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 }} />
                    <Bar dataKey="count" name="Events" fill="#FF2D2D" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyChartState message="No events yet" />}
          </ChartCard>
          <ChartCard title="Events by Type" subtitle="Breakdown across categories" icon={Users}>
            {loading ? <div className="h-70 w-full animate-pulse rounded-xl bg-page" /> : byType.length ? (
              <div className="h-70 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byType} dataKey="count" nameKey="type" innerRadius="50%" outerRadius="80%" paddingAngle={2}>
                      {byType.map((entry, index) => <Cell key={entry.type} fill={CHART_COLORS[index % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : <EmptyChartState message="No events yet" />}
          </ChartCard>
        </div>
      )}

      {canManage && (adding || editing) && (
        <Dialog title={editing ? "Edit Event" : "Add Event"} onClose={closeForm}>
          <EventForm form={form} setForm={setForm} saving={saving} error={formError} onCancel={closeForm} onSubmit={submit} bannerPreview={bannerPreview || form.bannerUrl} onBannerSelect={selectBanner} onBannerRemove={removeBanner} />
        </Dialog>
      )}

      {canManage && confirmDelete && (
        <Dialog title="Delete Event" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-muted">Delete <b>{confirmDelete.name}</b>? This will permanently remove the event and all of its participant records. This cannot be undone.</p>
          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted">Cancel</button>
            <button type="button" onClick={confirmDeleteEvent} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">Delete</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
