import { singaporeDate } from "./singapore-date";

// Data for the Volunteer panels (components/volunteer/*):
//   personalSummary — one person's "Volunteer Home Panel"
//   orgSummary      — the Director/Admin "leader console"
// Everything is derived from real records: event participation
// (academyEvents/*/participants, with hours credited by
// lib/server/event-hours.js), training attendance (attendance.durationMinutes),
// certificates, users and courses. Nothing here writes.

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const iso = (value) => (value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null);
const monthKey = (dateString) => (typeof dateString === "string" && /^\d{4}-\d{2}/.test(dateString) ? dateString.slice(0, 7) : null);

// Last six calendar months (oldest first) as { key: "2026-05", label: "MAY" }.
function lastSixMonths() {
  const [y, m] = singaporeDate().split("-").map(Number);
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (5 - i), 1));
    return { key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, label: MONTHS[d.getUTCMonth()] };
  });
}

// Impact score = total hours + 2 points per event completed.
export const impactScore = (hours, events) => round1(hours + events * 2);

export async function personalSummary(db, uid) {
  const today = singaporeDate();
  const [userSnap, eventsSnap, attendanceSnap, certificatesSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("academyEvents").get(),
    db.collection("attendance").where("studentId", "==", uid).get(),
    db.collection("certificates").where("studentId", "==", uid).get(),
  ]);
  const user = userSnap.exists ? userSnap.data() : {};

  // This person's participant doc on every event (one batched read).
  const events = eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const participantDocs = events.length
    ? await db.getAll(...events.map((e) => db.collection("academyEvents").doc(e.id).collection("participants").doc(uid)))
    : [];
  const mine = participantDocs
    .map((doc, i) => (doc.exists ? { event: events[i], p: doc.data() } : null))
    .filter(Boolean);
  const attended = mine.filter(({ p }) => p.attendanceStatus === "present");
  const upcoming = mine.filter(({ event, p }) => p.attendanceStatus !== "present" && (event.eventDate || "") >= today);
  const missedEvents = mine.filter(({ event, p }) => p.attendanceStatus !== "present" && event.eventDate && event.eventDate < today);

  const volunteerHours = attended.filter(({ p }) => p.eventRole === "Volunteer").reduce((s, { p }) => s + (Number(p.hoursCredited) || 0), 0);
  const eventHours = attended.filter(({ p }) => p.eventRole !== "Volunteer").reduce((s, { p }) => s + (Number(p.hoursCredited) || 0), 0);
  const attendance = attendanceSnap.docs.map((d) => d.data());
  const trainingHours = attendance.reduce((s, a) => s + (Number(a.durationMinutes) || 0) / 60, 0);
  const missedTrainings = attendance.filter((a) => a.status === "absent").length;

  const months = lastSixMonths();
  const activity = months.map(({ key, label }) => ({
    label,
    events: round1(attended.filter(({ event }) => monthKey(event.eventDate) === key).reduce((s, { p }) => s + (Number(p.hoursCredited) || 0), 0)),
    trainings: round1(attendance.filter((a) => monthKey(a.date) === key).reduce((s, a) => s + (Number(a.durationMinutes) || 0) / 60, 0)),
  }));

  const totalHours = round1(volunteerHours + eventHours + trainingHours);
  return {
    profile: {
      displayName: user.displayName || user.email || "",
      email: user.email || "",
      phone: user.phone || "",
      role: user.role || "",
      photoURL: user.photoURL || "",
      memberSince: iso(user.createdAt),
    },
    impactScore: impactScore(totalHours, attended.length),
    totalHours,
    volunteerHours: round1(volunteerHours),
    eventHours: round1(eventHours),
    trainingHours: round1(trainingHours),
    eventsAttended: attended.length,
    upcomingEvents: upcoming.length,
    missedEvents: missedEvents.length,
    missedTrainings,
    certificates: certificatesSnap.size,
    activity,
    activityTotal: round1(activity.reduce((s, m) => s + m.events + m.trainings, 0)),
    recentEvents: attended
      .sort((a, b) => (b.event.eventDate || "").localeCompare(a.event.eventDate || ""))
      .slice(0, 5)
      .map(({ event, p }) => ({ id: event.id, name: event.name || "Event", date: event.eventDate || "", role: p.eventRole || "Participant", hours: Number(p.hoursCredited) || 0 })),
  };
}

export async function orgSummary(db) {
  const today = singaporeDate();
  const [usersSnap, eventsSnap, coursesSnap, certificatesSnap, attendanceSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("academyEvents").get(),
    db.collection("courses").get(),
    db.collection("certificates").get(),
    db.collection("attendance").get(),
  ]);
  const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const volunteers = users.filter((u) => u.role === "Volunteer");
  const activeVolunteers = volunteers.filter((u) => u.active !== false);
  const students = users.filter((u) => u.role === "Student");
  const events = eventsSnap.docs.map((d) => d.data());
  const courses = coursesSnap.docs.map((d) => d.data()).filter((c) => c.status !== "Archived");
  const attendance = attendanceSnap.docs.map((d) => d.data());
  const certificates = certificatesSnap.docs.map((d) => d.data());

  const volunteerHours = users.reduce((s, u) => s + (Number(u.volunteerHours) || 0), 0);
  const eventHours = users.reduce((s, u) => s + (Number(u.eventHours) || 0), 0);
  const trainingHours = attendance.reduce((s, a) => s + (Number(a.durationMinutes) || 0) / 60, 0);

  const months = lastSixMonths();
  const trend = months.map(({ key, label }) => ({
    label,
    events: events.filter((e) => monthKey(e.eventDate) === key).length,
    trainings: courses.filter((c) => monthKey(c.startDate) === key).length,
    certificates: certificates.filter((c) => monthKey(iso(c.issueDate) || iso(c.createdAt)) === key).length,
  }));
  const peak = trend.reduce((best, m) => {
    const total = m.events + m.trainings + m.certificates;
    return total > best.total ? { label: m.label, total } : best;
  }, { label: "", total: 0 });

  const topVolunteers = users
    .filter((u) => (Number(u.volunteerHours) || 0) + (Number(u.eventHours) || 0) > 0)
    .map((u) => ({
      id: u.id,
      name: u.displayName || u.email || "Member",
      photoURL: u.photoURL || "",
      role: u.role || "",
      volunteerHours: round1(u.volunteerHours),
      eventHours: round1(u.eventHours),
      eventsAttended: Number(u.eventsAttended) || 0,
    }))
    .sort((a, b) => b.volunteerHours + b.eventHours - (a.volunteerHours + a.eventHours))
    .slice(0, 8);

  const openEvents = events.filter((e) => e.published !== false && (e.eventDate || "") >= today).length;
  return {
    snapshot: {
      activeVolunteers: activeVolunteers.length,
      openEvents,
      trainings: courses.length,
      certificates: certificates.length,
      hoursContributed: round1(volunteerHours + eventHours),
      pendingApprovals: users.filter((u) => u.status === "pending").length,
    },
    people: {
      students: students.length,
      volunteers: volunteers.length,
      activeVolunteers: activeVolunteers.length,
    },
    hours: {
      trainingHours: round1(trainingHours),
      volunteerHours: round1(volunteerHours),
      eventHours: round1(eventHours),
      certificates: certificates.length,
    },
    programmes: { trainings: courses.length, events: events.length },
    insights: {
      avgLearningHoursPerStudent: students.length ? round1(trainingHours / students.length) : 0,
      avgVolunteerHoursPerVolunteer: volunteers.length ? round1(volunteerHours / volunteers.length) : 0,
      activeVolunteerRate: volunteers.length ? Math.round((activeVolunteers.length / volunteers.length) * 100) : 0,
      totalProgrammes: courses.length + events.length,
      peakMonth: peak.total ? `${peak.label} · ${peak.total} activities` : "—",
    },
    trend,
    topVolunteers,
    generatedAt: new Date().toISOString(),
  };
}
