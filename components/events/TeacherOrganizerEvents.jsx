"use client";

// A small, read-only entry point so a Teacher set as an event's organizer
// (see EventForm's "Organizer (staff account)" field) can find it and reach
// its Attendance tab — components/events/EventDetailsPage.jsx already
// grants an organizer Teacher full Participants/Attendance access there.
// This never touches the Teacher's own personal reminder events above it.
import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { computeEventStatus } from "../../lib/events-shared";

const statusTones = { Upcoming: "bg-info-soft text-info", Ongoing: "bg-success-soft text-success", Completed: "bg-page text-subtle", Cancelled: "bg-active text-primary", Draft: "bg-warning-soft text-warning" };

export default function TeacherOrganizerEvents({ teacherId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !teacherId) return undefined;
    return onSnapshot(
      query(collection(db, "academyEvents"), where("organizerId", "==", teacherId)),
      (snapshot) => {
        setEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => (a.eventDate || "").localeCompare(b.eventDate || "")));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [teacherId]);

  if (loading) return <p className="py-6 text-center text-sm text-muted">Loading academy events...</p>;
  if (!events.length) return <p className="py-6 text-center text-sm text-muted">You are not currently set as the organizer for any academy event.</p>;

  return (
    <div className="space-y-2">
      {events.map((event) => {
        const status = computeEventStatus(event);
        return (
          <Link key={event.id} href={`/dashboard/events/${event.id}`} className="flex items-center justify-between rounded-xl border border-border-subtle bg-card p-4 hover:bg-active">
            <div>
              <b className="block text-sm text-ink">{event.name}</b>
              <span className="text-xs text-muted">{event.eventDate} · {event.startTime}–{event.endTime} · {event.location || "Location not set"}</span>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusTones[status] || "bg-page text-muted"}`}>{status}</span>
          </Link>
        );
      })}
    </div>
  );
}
