"use client";

import { useEffect, useState } from "react";
import { CalendarClock, MapPin } from "lucide-react";
import { loadUsersByIds } from "../../lib/training-detail";
import {
  createClassSession,
  deleteClassSession,
  subscribeCourseClassSessions,
  updateClassSession,
} from "../../lib/class-sessions-data";
import SessionQrDialog from "./SessionQrDialog";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";

// A "class session" is one specific dated/timed physical meeting of an
// existing `classes/{id}` batch — see firestore.rules'/class-sessions API's
// own header comments for why this is new (nothing existing modeled a
// single occurrence in advance) rather than a duplicate of `classes` or a
// new Batch concept. This panel lives inside the existing Classes tab, it
// does not replace it — the batch-level info above stays exactly as-is.
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

// The user's real local/browser date as a plain "YYYY-MM-DD" string, built
// from local getFullYear/getMonth/getDate — NOT `toISOString().slice(0,10)`
// (that reads the UTC date, which is a different calendar day from the
// user's own for part of the day in most timezones, exactly the "UTC
// date-shift bug" this button must avoid).
function todayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Current local time as "HH:MM" (24-hour), matching the exact string
// format `<input type="time">` already stores/reads — built from local
// getHours/getMinutes, same reasoning as todayLocalDate() above.
function nowLocalTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// One hour after a given "HH:MM" string, wrapping past midnight if needed —
// used only as a starting default; the field stays fully editable after.
function addOneHour(hhmm) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const total = (hours * 60 + minutes + 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const blank = { title: "", date: "", startTime: "", endTime: "", location: "", notes: "", teacherId: "" };

export default function ClassSessionsPanel({ course, classes, canManage, isAssignedTeacher, currentUid }) {
  const [sessions, setSessions] = useState([]);
  const [teacherNames, setTeacherNames] = useState(new Map());
  const [editing, setEditing] = useState(null); // { classId } for new, or session object for edit
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [qrSession, setQrSession] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => subscribeCourseClassSessions(course.id, setSessions, () => {}), [course.id]);

  useEffect(() => {
    const ids = [...new Set(classes.flatMap((item) => item.teacherIds || []))];
    if (!ids.length) return;
    let cancelled = false;
    loadUsersByIds(ids).then((rows) => {
      if (!cancelled) setTeacherNames(new Map(rows.map((row) => [row.id, row.displayName || row.email || row.id])));
    });
    return () => {
      cancelled = true;
    };
  }, [classes]);

  function canManageClass(classItem) {
    return canManage || (isAssignedTeacher && (classItem.teacherIds || []).includes(currentUid));
  }

  function openCreate(classItem) {
    setEditing({ classId: classItem.id, isNew: true });
    setForm({ ...blank, teacherId: (classItem.teacherIds || [])[0] || "" });
    setError("");
  }
  function openEdit(session) {
    setEditing(session);
    setForm({ title: session.title, date: session.date, startTime: session.startTime, endTime: session.endTime, location: session.location, notes: session.notes || "", teacherId: session.teacherId || "" });
    setError("");
  }
  function close() {
    setEditing(null);
    setError("");
  }

  async function save() {
    if (!form.title.trim() || !form.date) {
      setError("Enter a class name and date.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (editing.isNew) {
        await createClassSession({ courseId: course.id, classId: editing.classId, ...form });
      } else {
        await updateClassSession({ id: editing.id, ...form });
      }
      close();
    } catch (err) {
      setError(err.message || "Unable to save this class.");
    } finally {
      setSaving(false);
    }
  }

  function cancelSession(session) {
    return confirm({
      title: "Cancel class session",
      message: `Cancel "${session.title}" on ${formatDate(session.date)}?`,
      tone: "danger",
      confirmLabel: "Cancel session",
      cancelLabel: "Keep it",
      onConfirm: async () => {
        await updateClassSession({ id: session.id, status: "cancelled" });
        toast.success("Class session cancelled");
      },
    });
  }
  function removeSession(session) {
    return confirm({
      title: "Delete class session",
      message: `Permanently delete "${session.title}"? This cannot be undone.`,
      tone: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        await deleteClassSession(session.id);
        toast.success("Class session deleted");
      },
    });
  }

  return (
    <div className="mt-6 space-y-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Class Sessions</p>
      {classes.map((classItem) => {
        const classSessions = sessions.filter((item) => item.classId === classItem.id);
        const allowed = canManageClass(classItem);
        return (
          <div key={classItem.id} className="rounded-2xl border border-border-subtle p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b className="text-sm">{classItem.name || "Batch"}</b>
              {allowed && (
                <button
                  type="button"
                  onClick={() => openCreate(classItem)}
                  className="rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-white"
                >
                  + Create Class Session
                </button>
              )}
            </div>
            <div className="mt-3">
              {classSessions.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead className="border-b border-border-subtle text-[10px] uppercase tracking-wider text-subtle">
                      <tr>
                        {["Session", "Date & Time", "Location", "Teacher", "Status", ...(allowed ? ["Actions"] : [])].map((label) => (
                          <th key={label} className="p-2.5 font-bold">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {classSessions.map((session) => (
                        <tr key={session.id} className="border-b border-border-subtle last:border-0">
                          <td className="p-2.5 font-bold text-ink">{session.title || "—"}</td>
                          <td className="p-2.5 text-muted">
                            <span className="flex items-center gap-1">
                              <CalendarClock className="h-3 w-3 shrink-0" aria-hidden="true" />
                              {formatDate(session.date)}{session.startTime && session.endTime ? ` · ${session.startTime}–${session.endTime}` : ""}
                            </span>
                          </td>
                          <td className="p-2.5 text-muted">
                            {session.location ? (
                              <span className="flex items-center gap-1"><MapPin className="h-3 w-3 shrink-0" aria-hidden="true" /> {session.location}</span>
                            ) : "—"}
                          </td>
                          <td className="p-2.5 text-muted">{session.teacherId ? (teacherNames.get(session.teacherId) || "—") : "—"}</td>
                          <td className="p-2.5">
                            {session.status !== "scheduled" ? (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${session.status === "cancelled" ? "bg-active text-primary" : "bg-success-soft text-success"}`}>
                                {session.status === "cancelled" ? "Cancelled" : "Completed"}
                              </span>
                            ) : (
                              <span className="rounded-full bg-page px-2 py-0.5 text-[10px] font-bold text-muted">Scheduled</span>
                            )}
                          </td>
                          {allowed && (
                            <td className="p-2.5">
                              <div className="flex flex-wrap gap-2 font-bold">
                                {/* Only offered on the session's own real
                                    date — the server rejects starting a QR
                                    on any other day anyway (no manual
                                    per-student marking; students self-check-
                                    in by scanning this). */}
                                {session.status === "scheduled" && session.date === todayLocalDate() && (
                                  <button onClick={() => setQrSession(session)} className="rounded-lg bg-primary px-2.5 py-1 text-white hover:bg-primary-hover">Show QR</button>
                                )}
                                <button onClick={() => openEdit(session)} className="rounded-lg border border-border-subtle px-2.5 py-1 text-ink hover:bg-active">Edit</button>
                                {session.status !== "cancelled" && (
                                  <button onClick={() => cancelSession(session)} className="rounded-lg border border-border-subtle px-2.5 py-1 text-primary hover:bg-active">Cancel</button>
                                )}
                                <button onClick={() => removeSession(session)} className="rounded-lg border border-border-subtle px-2.5 py-1 text-primary hover:bg-active">Delete</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted">No class sessions scheduled yet.</p>
              )}
            </div>
          </div>
        );
      })}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-card p-6 shadow-xl">
            <h4 className="text-sm font-bold text-ink">{editing.isNew ? "Create Class Session" : "Edit Class Session"}</h4>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Class Name / Number
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Class 1" className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
            </label>
            {/* Date gets its own full-width row so the input + Today
                button always have room to sit cleanly side by side —
                previously all three (Date/Start/End) shared one 3-column
                grid, which squeezed Date+Today into the same narrow column
                and made Today visually crowd/overlap the Start field next
                to it. Start/End keep their own compact row below. */}
            <div className="grid gap-1 text-xs font-bold text-muted">
              {/* Explicit htmlFor/id, not an implicit wrapping <label> —
                  a <button> nested inside a <label> gets its click
                  "forwarded" by the browser to the label's associated
                  control (the date input), which for type="date" pops
                  open the native date picker on every click and makes
                  the button appear unresponsive. Keeping the button
                  outside the label (as a sibling) avoids that. */}
              <label htmlFor="class-session-date">Date</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id="class-session-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="min-w-0 flex-1 rounded-xl border border-border-subtle px-2 py-2 text-sm font-normal"
                />
                <button
                  type="button"
                  onClick={() => {
                    const start = nowLocalTime();
                    setForm({ ...form, date: todayLocalDate(), startTime: start, endTime: addOneHour(start) });
                  }}
                  className="shrink-0 rounded-xl border border-border-subtle bg-page px-3 py-2 text-[11px] font-bold text-muted hover:bg-active hover:text-primary"
                  title="Set to today's date and current time (Start +1h for End)"
                >
                  Today
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1 text-xs font-bold text-muted">
                Start
                <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="rounded-xl border border-border-subtle px-2 py-2 text-sm font-normal" />
              </label>
              <label className="grid gap-1 text-xs font-bold text-muted">
                End
                <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="rounded-xl border border-border-subtle px-2 py-2 text-sm font-normal" />
              </label>
            </div>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Location
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Oxlybiz Hub" className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Teacher
              <select value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal">
                <option value="">Select teacher</option>
                {(classes.find((item) => item.id === (editing.isNew ? editing.classId : editing.classId))?.teacherIds || []).map((id) => (
                  <option key={id} value={id}>{teacherNames.get(id) || id}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Notes (optional)
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
            </label>
            {error && <p className="text-xs text-primary">{error}</p>}
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={close} disabled={saving} className="px-4 py-2 text-sm font-bold text-muted">Cancel</button>
              <button onClick={save} disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {saving ? "Saving..." : "Create Class"}
              </button>
            </div>
          </div>
        </div>
      )}

      {qrSession && <SessionQrDialog session={qrSession} onClose={() => setQrSession(null)} />}
    </div>
  );
}
