"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { attendancePercent } from "../../lib/attendance";
import { loadUsersByIds } from "../../lib/training-detail";
import { loadTeacherAttendance, markTeacherAttendance } from "../../lib/services/teacher-attendance-service";
import AttendanceStatusPicker from "../training/AttendanceStatusPicker";
import DataTable, { StatusBadge } from "../data-table/DataTable";
import { SkeletonList } from "../ui/Skeleton";

// Teacher attendance UI (records live in `teacherAttendance`, see
// lib/server/teacher-attendance-core.js). Two entry points, one component
// file so they can never drift apart:
//   - TeacherAttendancePanel → Training → Attendance → "Teachers" view
//     (one training; Admin/Director can mark, a Teacher sees their own)
//   - TeacherAttendanceOverview → User → Teachers → "Attendance" tab
//     (every teacher across every training)

const STATUS_TONE = { present: "green", absent: "red", late: "orange", excused: "blue" };
const label = (status) => (status ? status[0].toUpperCase() + status.slice(1) : "");

// Local calendar date, not toISOString() (that's the UTC date).
function todayLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function timeOf(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function durationOf(minutes) {
  if (typeof minutes !== "number") return "—";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function recordColumns({ showCourse }) {
  return [
    { key: "teacherName", header: "Teacher", sortable: true, accessor: (r) => r.teacherName || "", render: (r) => <b className="text-ink">{r.teacherName || "—"}</b> },
    { key: "teacherEmail", header: "Email", accessor: (r) => r.teacherEmail || "" },
    { key: "teacherPhone", header: "Phone", accessor: (r) => r.teacherPhone || "" },
    ...(showCourse ? [{ key: "courseTitle", header: "Training", sortable: true, filter: {}, accessor: (r) => r.courseTitle || "" }] : []),
    { key: "date", header: "Date", sortable: true, accessor: (r) => r.date || "" },
    { key: "status", header: "Status", sortable: true, filter: {}, accessor: (r) => label(r.status), render: (r) => <StatusBadge tone={STATUS_TONE[r.status] || "gray"}>{r.status || "—"}</StatusBadge> },
    { key: "checkInAt", header: "Check-in", accessor: (r) => timeOf(r.checkInAt) },
    { key: "checkOutAt", header: "Check-out", accessor: (r) => timeOf(r.checkOutAt) },
    { key: "durationMinutes", header: "Duration", accessor: (r) => durationOf(r.durationMinutes) },
    { key: "markedByName", header: "Marked By", accessor: (r) => r.markedByName || "" },
    { key: "note", header: "Note", accessor: (r) => r.note || "" },
  ];
}

// One row per teacher: attendance % + per-status counts.
function SummaryCards({ teachers, records }) {
  if (!teachers.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {teachers.map((teacher) => {
        const own = records.filter((r) => r.teacherId === teacher.id);
        const percent = attendancePercent(own);
        const count = (status) => own.filter((r) => r.status === status).length;
        return (
          <div key={teacher.id} className="rounded-2xl border border-border-subtle bg-page p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <b className="block truncate text-sm text-ink">{teacher.displayName || teacher.email || "Teacher"}</b>
                <span className="block truncate text-[11px] text-muted">{[teacher.email, teacher.phone].filter(Boolean).join(" · ") || "—"}</span>
              </div>
              <span className="shrink-0 text-lg font-black text-primary">{percent == null ? "—" : `${percent}%`}</span>
            </div>
            <p className="mt-2 text-[11px] text-muted">
              {count("present")} present · {count("late")} late · {count("absent")} absent · {count("excused")} excused
            </p>
          </div>
        );
      })}
    </div>
  );
}

// Keyed by date (+ a reload counter) from the parent, so switching date
// remounts it with that day's saved statuses — same pattern as the student
// AttendanceMarkGrid in TrainingDetailsPage.jsx.
function TeacherMarkGrid({ courseId, classId, date, teachers, records, onSaved }) {
  const [statuses, setStatuses] = useState(() =>
    Object.fromEntries(records.filter((r) => r.date === date).map((r) => [r.teacherId, r.status])),
  );
  const [notes, setNotes] = useState(() =>
    Object.fromEntries(records.filter((r) => r.date === date).map((r) => [r.teacherId, r.note || ""])),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await markTeacherAttendance({
        courseId,
        classId,
        date,
        records: teachers.map((teacher) => ({ teacherId: teacher.id, status: statuses[teacher.id] || "present", note: notes[teacher.id] || "" })),
      });
      setMessage("Teacher attendance saved.");
      onSaved();
    } catch (error) {
      setMessage(error.message || "Unable to save teacher attendance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      {teachers.map((teacher) => (
        <div key={teacher.id} className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-page p-3 text-xs lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <b className="block text-ink">{teacher.displayName || teacher.email}</b>
            <span className="block text-[11px] text-muted">{[teacher.email, teacher.phone].filter(Boolean).join(" · ")}</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <AttendanceStatusPicker
              value={statuses[teacher.id] || "present"}
              onChange={(status) => setStatuses({ ...statuses, [teacher.id]: status })}
            />
            <input
              value={notes[teacher.id] || ""}
              onChange={(event) => setNotes({ ...notes, [teacher.id]: event.target.value })}
              placeholder="Note (optional)"
              maxLength={300}
              className="rounded-lg border border-border-subtle bg-card px-2.5 py-1.5 text-xs sm:w-44"
            />
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={save} disabled={saving || !teachers.length} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">
          {saving ? "Saving..." : "Save Teacher Attendance"}
        </button>
        {message && <p className="text-xs text-muted">{message}</p>}
      </div>
    </div>
  );
}

export function TeacherAttendancePanel({ course, classes, canMark }) {
  const teacherIdsKey = [...new Set([course.primaryTeacherId, course.assistantTeacherId, ...(course.teacherIds || [])].filter(Boolean))].join(",");
  const [teachers, setTeachers] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [version, setVersion] = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    return loadTeacherAttendance({ courseId: course.id })
      .then((rows) => { setRecords(rows); setError(""); setVersion((v) => v + 1); })
      .catch((err) => setError(err.message || "Unable to load teacher attendance."))
      .finally(() => setLoading(false));
  }, [course.id]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  useEffect(() => {
    let cancelled = false;
    const ids = teacherIdsKey ? teacherIdsKey.split(",") : [];
    loadUsersByIds(ids).then((rows) => { if (!cancelled) setTeachers(rows); }).catch(() => {});
    return () => { cancelled = true; };
  }, [teacherIdsKey]);

  return (
    <div className="space-y-5">
      {error && <p className="rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}

      {canMark && (
        <div className="space-y-3 border-b border-border-subtle pb-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Mark teacher attendance</p>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs" />
          </div>
          {!teachers.length ? (
            <p className="text-xs text-muted">No teacher is assigned to this training yet — assign one from the Assign tab.</p>
          ) : (
            <TeacherMarkGrid
              key={`${date}_${version}`}
              courseId={course.id}
              classId={course.primaryClassId || classes[0]?.id || ""}
              date={date}
              teachers={teachers}
              records={records}
              onSaved={load}
            />
          )}
          <p className="text-[11px] text-subtle">Teachers can also check in/out by having their ID Card scanned in Scan QR Code.</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">{canMark ? "Teacher attendance summary" : "My attendance for this training"}</p>
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-2.5 py-1 text-[11px] font-bold text-muted hover:bg-page disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
        </button>
      </div>
      {loading && !records.length ? (
        <SkeletonList count={3} />
      ) : (
        <>
          <SummaryCards teachers={canMark ? teachers : teachers.filter((t) => records.some((r) => r.teacherId === t.id))} records={records} />
          <DataTable
            title="teacher attendance"
            name={`teacher-attendance-${course.id}`}
            columns={recordColumns({ showCourse: false })}
            rows={records}
            initialSort={{ key: "date", dir: "desc" }}
            pageSize={10}
            emptyLabel="No teacher attendance has been recorded yet."
          />
        </>
      )}
    </div>
  );
}

export function TeacherAttendanceOverview({ teachers }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [teacherId, setTeacherId] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    return loadTeacherAttendance()
      .then((rows) => { setRecords(rows); setError(""); })
      .catch((err) => setError(err.message || "Unable to load teacher attendance."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const visibleTeachers = useMemo(
    () => (teacherId ? teachers.filter((t) => t.id === teacherId) : teachers),
    [teachers, teacherId],
  );
  const visibleRecords = useMemo(
    () => (teacherId ? records.filter((r) => r.teacherId === teacherId) : records),
    [records, teacherId],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select value={teacherId} onChange={(event) => setTeacherId(event.target.value)} className="rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs font-semibold text-ink shadow-sm">
          <option value="">All teachers</option>
          {teachers.map((t) => <option key={t.id} value={t.id}>{t.displayName || t.email}</option>)}
        </select>
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1 rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs font-bold text-muted hover:bg-page disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
        </button>
      </div>
      {error && <p className="rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}
      {loading && !records.length ? (
        <SkeletonList count={5} />
      ) : (
        <>
          <SummaryCards teachers={visibleTeachers} records={visibleRecords} />
          <DataTable
            title="teacher attendance"
            name="teacher-attendance"
            columns={recordColumns({ showCourse: true })}
            rows={visibleRecords}
            initialSort={{ key: "date", dir: "desc" }}
            pageSize={10}
            emptyLabel="No teacher attendance has been recorded yet. Mark it from a training's Attendance tab, or scan a teacher's ID Card in Scan QR Code."
          />
        </>
      )}
    </div>
  );
}

// Compact one-teacher summary for the Teacher Directory's "View" dialog.
export function TeacherAttendanceSummary({ teacherId }) {
  const [records, setRecords] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadTeacherAttendance({ teacherId })
      .then((rows) => { if (!cancelled) setRecords(rows); })
      .catch(() => { if (!cancelled) setRecords([]); });
    return () => { cancelled = true; };
  }, [teacherId]);

  if (records === null) return <p className="text-xs text-muted">Loading attendance…</p>;
  if (!records.length) return <p className="text-xs text-muted">No attendance recorded yet.</p>;
  const percent = attendancePercent(records);
  const count = (status) => records.filter((r) => r.status === status).length;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        <b className="text-base text-primary">{percent == null ? "—" : `${percent}%`}</b>{" "}
        · {count("present")} present · {count("late")} late · {count("absent")} absent · {count("excused")} excused
      </p>
      <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle text-xs">
        {records.slice(0, 5).map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0 truncate text-muted">{r.date} · {r.courseTitle || "Training"}</span>
            <StatusBadge tone={STATUS_TONE[r.status] || "gray"}>{r.status}</StatusBadge>
          </li>
        ))}
      </ul>
    </div>
  );
}
