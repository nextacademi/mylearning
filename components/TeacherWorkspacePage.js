"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TeacherGate from "./TeacherGate";
import { useAuth } from "../lib/auth-context";
import {
  createTeacherAchievement,
  createTeacherCertificate,
  createTeacherEvent,
  deleteTeacherEvent,
  checkCertificateEligibility,
  saveAttendance,
  subscribeTeacherDashboard,
  updateTeacherEvent,
  updateTeacherProfile,
} from "../lib/teacher-data";
import { db } from "../lib/firebase";
import { ACHIEVEMENT_TYPES } from "../lib/achievement-shared";
import AttendanceStatusPicker from "./training/AttendanceStatusPicker";
import { subscribeCourseClassSessions } from "../lib/class-sessions-data";
import TrainingManagement from "./training/TrainingManagement";
import WorkspaceShell from "./dashboard/WorkspaceShell";
import IdCardPrint from "./teacher/IdCardPrint";
import ChatWorkspace from "./chat/ChatWorkspace";
import { NotificationList } from "./dashboard/NotificationBell";
import SettingsPage from "./settings/SettingsPage";
import { markNotificationRead } from "../lib/notification-data";
import { uploadProfilePhoto, validateAvatarFile } from "../lib/profile-data";
import { scanAttendanceQr } from "../lib/services/qr-service";
import DocumentsModule from "./documents/DocumentsModule";
import {
  createPromotionLink,
  subscribeTeacherLeads,
  subscribeTeacherPromotionLinks,
} from "../lib/teacher-promote";
import QRCode from "qrcode";
import EventManagement from "./events/EventManagement";
import StudentEvents from "./events/StudentEvents";
import Shop from "./shop/Shop";
import TeacherExams from "./exams/TeacherExams";

// Sidebar nav is intentionally a fixed 9-item list per product spec — do not
// add Promote/Notifications/etc. here. Their pages still exist and remain
// reachable by direct URL; they're just not linked from the Teacher sidebar.
const links = [
  "Dashboard",
  "Students",
  "Training",
  "Event",
  "Events",
  "My Shop",
  "Documents",
  "Chat",
  "Achievement",
  "Model Test",
  "ID Card",
  "Scan QR Code",
];
const paths = {
  Dashboard: "/teacher/dashboard",
  Students: "/teacher/students",
  Training: "/teacher/training",
  Attendance: "/teacher/attendance",
  Event: "/teacher/events",
  Events: "/teacher/all-events",
  "My Shop": "/teacher/shop",
  Achievement: "/teacher/achievements",
  "Model Test": "/teacher/exams",
  Certificates: "/teacher/certificates",
  Chat: "/teacher/chat",
  Assignments: "/teacher/assignments",
  Submissions: "/teacher/submissions",
  Results: "/teacher/results",
  Notifications: "/teacher/notifications",
  Profile: "/teacher/profile",
  Settings: "/teacher/settings",
  "ID Card": "/teacher/id-card",
  "Scan QR Code": "/teacher/scan-qr",
  Documents: "/teacher/documents",
  Promote: "/teacher/promote",
};
const blank = {
  classes: [],
  students: [],
  courses: [],
  assignments: [],
  submissions: [],
  attendance: [],
  events: [],
  activities: [],
  achievements: [],
  certificates: [],
  conversations: [],
  notifications: [],
};

function Empty({ children }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-subtle bg-card p-8 text-center text-sm text-muted">
      {children}
    </div>
  );
}
function Panel({ title, children, action }) {
  return (
    <section className="rounded-3xl border border-border-subtle/70 bg-card p-5 shadow-sm md:p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
function Field({ label, ...props }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted">
      {label}
      <input
        {...props}
        className="rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-xs font-normal outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
  );
}

export function TeacherShell({ active, children, unread }) {
  const { user, profile, logout } = useAuth();
  const name =
    profile?.displayName ||
    user?.displayName ||
    user?.email?.split("@")[0] ||
    "Teacher";
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <WorkspaceShell
      modules={links}
      active={active}
      getHref={(module) => paths[module]}
      renderBadge={(module) =>
        module === "Chat" && unread > 0 ? (
          <b className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-white">
            {unread}
          </b>
        ) : null
      }
      name={name}
      initials={initials}
      photoURL={profile?.photoURL}
      uid={user?.uid}
      userEmail={user?.email}
      headerTitle={active === "Dashboard" ? "Teacher Dashboard" : active}
      headerSubtitle="Classroom overview"
      onLogout={logout}
    >
      {children}
    </WorkspaceShell>
  );
}

function DashboardView({ data }) {
  const attendanceTotal = data.attendance.length;
  const attended = data.attendance.filter((item) =>
    ["present", "late"].includes(item.status),
  ).length;
  const attendance = attendanceTotal
    ? `${Math.round((attended / attendanceTotal) * 100)}%`
    : "—";
  const pending = data.submissions.filter(
    (item) => item.status === "submitted",
  ).length;
  const stats = [
    ["My students", data.students.length, `${data.classes.length} classes`],
    ["Assignments", pending, "pending review"],
    ["Attendance", attendance, "from recorded sessions"],
    ["Class rating", "—", "No ratings yet"],
  ];
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 text-ink shadow-xl md:p-8">
        <h2 className="text-3xl font-extrabold">
          Teacher Dashboard
        </h2>
        <p className="mt-2 text-xs text-muted">
          Manage your courses, classes, students, and teaching activities.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([label, value, note]) => (
          <article
            key={label}
            className="rounded-2xl border border-border-subtle/70 bg-card p-5 shadow-sm"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">
              {label}
            </p>
            <h3 className="mt-2 text-3xl font-extrabold">{value}</h3>
            <span className="mt-2 block text-[10px] text-muted">
              {note}
            </span>
          </article>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Upcoming schedule">
          {data.events.length ? (
            data.events.slice(0, 5).map((event) => (
              <div
                key={event.id}
                className="border-b border-border-subtle py-3 last:border-0"
              >
                <b className="block text-sm">{event.title}</b>
                <span className="text-xs text-muted">
                  {event.date} · {event.startTime || "Time not set"} ·{" "}
                  {event.location || "Location not set"}
                </span>
              </div>
            ))
          ) : (
            <Empty>No upcoming events or classes</Empty>
          )}
        </Panel>
        <Panel title="Recent activity">
          {data.activities.length ? (
            data.activities.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="border-b border-border-subtle py-3 last:border-0"
              >
                <b className="block text-sm">{item.title}</b>
                <span className="text-xs text-muted">
                  {item.description}
                </span>
              </div>
            ))
          ) : (
            <Empty>No recent activity</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}

function StudentsView({ data }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const filtered = data.students.filter((student) =>
    `${student.displayName} ${student.email}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const rows = filtered.slice((page - 1) * 10, page * 10);
  return (
    <Panel
      title="Students"
      action={
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search students"
          className="w-40 rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary"
        />
      }
    >
      {rows.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border-subtle text-[10px] uppercase tracking-wider text-subtle">
                <tr>
                  <th className="p-3">User ID</th>
                  <th className="p-3">Student</th>
                  <th className="p-3">Contact</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((student) => (
                  <tr key={student.id} className="border-b border-border-subtle">
                    <td className="p-3 font-mono text-xs">
                      {student.userId || "—"}
                    </td>
                    <td className="p-3 font-semibold">
                      {student.displayName || "Unnamed student"}
                    </td>
                    <td className="p-3 text-muted">
                      {student.email || "No contact"}
                    </td>
                    <td className="p-3">
                      {student.active === false ? "Inactive" : "Active"}
                    </td>
                    <td className="p-3">
                      <Link
                        href={`/teacher/students/${student.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        View profile →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-between text-xs">
            <button
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              className="font-semibold text-primary disabled:text-subtle"
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.max(1, Math.ceil(filtered.length / 10))}
            </span>
            <button
              disabled={page * 10 >= filtered.length}
              onClick={() => setPage(page + 1)}
              className="font-semibold text-primary disabled:text-subtle"
            >
              Next
            </button>
          </div>
        </>
      ) : (
        <Empty>No students found</Empty>
      )}
    </Panel>
  );
}

function TrainingView({ data }) {
  return (
    <Panel title="Courses and training">
      {data.courses.length ? (
        data.courses.map((course) => (
          <Link
            key={course.id}
            href={`/teacher/courses/${course.id}`}
            className="mb-3 block w-full rounded-2xl border border-border-subtle p-4 text-left hover:border-red-line"
          >
            <b className="block">{course.title}</b>
            <span className="text-xs text-muted">
              {course.status || "Active"} ·{" "}
              {course.description || "No description"}
            </span>
            <span className="mt-3 block text-xs font-bold text-primary">
              Open course details →
            </span>
          </Link>
        ))
      ) : (
        <Empty>No training courses found</Empty>
      )}
    </Panel>
  );
}

function AttendanceView({ data, teacherId }) {
  const [classId, setClassId] = useState(data.classes[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState({});
  const [message, setMessage] = useState("");
  const students = data.students;
  async function save() {
    const records = students.map((student) => ({
      id: `${classId}_${student.id}_${date}`,
      classId,
      studentId: student.id,
      date,
      status: status[student.id] || "present",
    }));
    await saveAttendance(teacherId, records);
    setMessage("Attendance saved.");
    // Attendance just changed — re-check certificate eligibility for every
    // student marked present/late in this class (never a manual request).
    const courseId = data.classes.find((item) => item.id === classId)?.courseId || "";
    if (courseId) {
      students.forEach((student) => {
        if (status[student.id] === "present" || status[student.id] === "late") {
          checkCertificateEligibility(student.id, courseId);
        }
      });
    }
  }
  return (
    <Panel
      title="Attendance"
      action={
        <div className="flex gap-2">
          <select
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            className="rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs"
          >
            <option value="">Select class</option>
            {data.classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs"
          />
        </div>
      }
    >
      {!classId ? (
        <Empty>Select a class</Empty>
      ) : !students.length ? (
        <Empty>No enrolled students found</Empty>
      ) : (
        <>
          <div className="space-y-2">
            {students.map((student) => (
              <div
                key={student.id}
                className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-page p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
              >
                <b>{student.displayName || student.email}</b>
                <AttendanceStatusPicker
                  value={status[student.id] || "present"}
                  onChange={(value) => setStatus({ ...status, [student.id]: value })}
                />
              </div>
            ))}
          </div>
          <button
            onClick={save}
            className="mt-5 rounded-xl bg-primary px-5 py-3 text-xs font-bold text-white"
          >
            Save attendance
          </button>
          {message && (
            <p className="mt-3 text-xs text-success">{message}</p>
          )}
        </>
      )}
    </Panel>
  );
}

function EventsView({ data, teacherId }) {
  const empty = {
    title: "",
    description: "",
    date: "",
    startTime: "",
    endTime: "",
    location: "",
    classId: "",
  };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [section, setSection] = useState("My Reminders");
  async function save() {
    if (editing) await updateTeacherEvent(editing, teacherId, form);
    else await createTeacherEvent(teacherId, form);
    setForm(empty);
    setEditing(null);
    setMessage("Event saved.");
  }
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["My Reminders", "Academy Events"].map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setSection(item)}
            className={`rounded-full px-4 py-2 text-xs font-bold transition ${section === item ? "bg-primary text-white" : "bg-page text-muted hover:bg-active hover:text-primary"}`}
          >
            {item}
          </button>
        ))}
      </div>
      {section === "Academy Events" ? (
        <EventManagement />
      ) : (
    <div className="grid gap-4 lg:grid-cols-[.75fr_1fr]">
      <Panel title={editing ? "Edit event" : "Create event"}>
        <div className="grid gap-3">
          <Field
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <Field
            label="Date"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Start"
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
            <Field
              label="End"
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            />
          </div>
          <Field
            label="Location"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
          />
          <button
            onClick={save}
            className="rounded-xl bg-primary py-3 text-xs font-bold text-white"
          >
            Save event
          </button>
          {message && <p className="text-xs text-success">{message}</p>}
        </div>
      </Panel>
      <Panel title="Your events">
        {data.events.length ? (
          data.events.map((event) => (
            <div
              key={event.id}
              className="flex items-center justify-between border-b border-border-subtle py-4"
            >
              <div>
                <b className="block text-sm">{event.title}</b>
                <span className="text-xs text-muted">
                  {event.date} · {event.startTime || "Time not set"} ·{" "}
                  {event.location || "Location not set"}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditing(event.id);
                    setForm(event);
                  }}
                  className="text-xs font-bold text-primary"
                >
                  Edit
                </button>
                <button
                  onClick={() => deleteTeacherEvent(event.id)}
                  className="text-xs font-bold text-primary"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        ) : (
          <Empty>No upcoming events</Empty>
        )}
      </Panel>
    </div>
      )}
    </div>
  );
}

function StudentPicker({ students, value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs"
    >
      <option value="">Select student</option>
      {students.map((student) => (
        <option key={student.id} value={student.id}>
          {student.displayName || student.email || student.id}
        </option>
      ))}
    </select>
  );
}
function studentLabel(students, studentId) {
  const student = students.find((item) => item.id === studentId);
  return student?.displayName || student?.email || studentId || "Student not linked";
}
function AchievementsView({ data, teacherId }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState(ACHIEVEMENT_TYPES[0]);
  const [studentId, setStudentId] = useState("");
  async function create() {
    if (!title || !studentId) return;
    const student = data.students.find((item) => item.id === studentId);
    await createTeacherAchievement(teacherId, {
      title,
      description: "",
      type,
      studentId,
      classId: student?.classId || "",
    });
    setTitle("");
    setStudentId("");
  }
  return (
    <Panel
      title="Student achievements"
      action={
        <div className="flex flex-wrap gap-2">
          <StudentPicker
            students={data.students}
            value={studentId}
            onChange={setStudentId}
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-xl border border-border-subtle px-3 py-2 text-xs"
          >
            {ACHIEVEMENT_TYPES.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Achievement title"
            className="rounded-xl border border-border-subtle px-3 py-2 text-xs"
          />
          <button
            onClick={create}
            disabled={!title || !studentId}
            className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            Award
          </button>
        </div>
      }
    >
      {data.achievements.length ? (
        data.achievements.map((item) => (
          <div key={item.id} className="border-b border-border-subtle py-3">
            <b>{item.title}</b>
            <span className="ml-3 text-xs text-muted">
              {studentLabel(data.students, item.studentId)} · {item.type ? item.type.replace(/_/g, " ") : "Achievement"}
            </span>
          </div>
        ))
      ) : (
        <Empty>No achievements</Empty>
      )}
    </Panel>
  );
}
function CertificatesView({ data, teacherId }) {
  const [title, setTitle] = useState("");
  const [studentId, setStudentId] = useState("");
  async function create() {
    if (!title || !studentId) return;
    const student = data.students.find((item) => item.id === studentId);
    await createTeacherCertificate(teacherId, {
      title,
      studentId,
      courseId: student?.courseId || "",
      classId: student?.classId || "",
    });
    setTitle("");
    setStudentId("");
  }
  return (
    <Panel
      title="Certificates"
      action={
        <div className="flex flex-wrap gap-2">
          <StudentPicker
            students={data.students}
            value={studentId}
            onChange={setStudentId}
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Certificate title"
            className="rounded-xl border border-border-subtle px-3 py-2 text-xs"
          />
          <button
            onClick={create}
            disabled={!title || !studentId}
            className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            Issue
          </button>
        </div>
      }
    >
      {data.certificates.length ? (
        data.certificates.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle py-3">
            <div>
              <b>{item.title}</b>
              <span className="ml-3 text-xs text-muted">
                {studentLabel(data.students, item.studentId)} · {item.certificateCode || item.certificateId || item.id} · {item.status === "revoked" ? "Revoked" : "Active"}
              </span>
            </div>
            {item.status !== "revoked" && (
              <a
                href={`/api/certificates/${item.id}/pdf`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-border-subtle px-2 py-1 text-[11px] font-bold text-ink hover:bg-active"
              >
                View
              </a>
            )}
          </div>
        ))
      ) : (
        <Empty>No certificates</Empty>
      )}
    </Panel>
  );
}

function ScopedRecordsView({ title, records, empty }) {
  return <Panel title={title}>{records.length ? records.map((item) => <div key={item.id} className="border-b border-border-subtle py-3 last:border-0"><b className="block text-sm">{item.title || item.name || item.id}</b><span className="text-xs text-muted">{item.status || "No status"}</span></div>) : <Empty>{empty}</Empty>}</Panel>;
}

function ProfileView({ user, profile }) {
  const { refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || "");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!photoPreview) return undefined;
    return () => URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const currentPhoto = photoPreview || (photoRemoved ? "" : profile?.photoURL || "");

  function pickPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const invalid = validateAvatarFile(file);
    if (invalid) {
      setPhotoError(invalid);
      return;
    }
    setPhotoError("");
    setPhotoRemoved(false);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      let photoURL = profile?.photoURL || "";
      let photoPath = profile?.photoPath || "";
      if (photoFile) ({ photoURL, photoPath } = await uploadProfilePhoto(user.uid, photoFile));
      else if (photoRemoved) { photoURL = ""; photoPath = ""; }
      await updateTeacherProfile(user.uid, { displayName, photoURL, photoPath });
      setPhotoFile(null);
      setPhotoPreview("");
      setPhotoRemoved(false);
      await refreshProfile?.();
      setMessage("Profile updated.");
    } catch (error) {
      setMessage(error?.message || "Unable to update profile.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Panel title="Teacher profile">
      <div className="grid max-w-md gap-3">
        <Field label="Email" value={user.email || ""} disabled readOnly />
        <Field
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <div className="grid gap-2 text-xs font-semibold text-muted">
          Profile photo
          <div className="flex flex-wrap items-center gap-3">
            {currentPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentPhoto} alt="Profile" className="h-16 w-16 shrink-0 rounded-full border border-border-subtle object-cover" />
            ) : (
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-border-subtle bg-page text-base font-bold text-subtle">
                {(displayName || "?").trim().slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="inline-flex w-fit cursor-pointer items-center rounded-xl border border-border-subtle bg-page px-3 py-1.5 text-xs font-bold text-ink hover:bg-active">
                {currentPhoto ? "Change photo" : "Upload photo"}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pickPhoto} disabled={saving} className="hidden" />
              </label>
              {currentPhoto && (
                <button type="button" onClick={() => { setPhotoFile(null); setPhotoPreview(""); setPhotoRemoved(true); setPhotoError(""); }} disabled={saving} className="w-fit text-[11px] font-bold text-primary hover:underline disabled:opacity-50">
                  Remove photo
                </button>
              )}
              {photoFile && <span className="max-w-[220px] truncate text-[10px] text-subtle">{photoFile.name}</span>}
              <span className="text-[10px] font-normal text-subtle">JPG, PNG or WEBP · up to 5 MB</span>
              {photoError && <span className="text-[10px] font-semibold text-primary">{photoError}</span>}
            </div>
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="w-fit rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {message && <p className="text-xs text-muted">{message}</p>}
      </div>
    </Panel>
  );
}

function PromotionLinkCard({ link, courseTitle, leads }) {
  const [qrImage, setQrImage] = useState("");
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${process.env.NEXT_PUBLIC_BASE_URL || window.location.origin}/promote/${link.id}`
      : "";

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { margin: 1, width: 140 }).then(setQrImage);
  }, [url]);

  function copy() {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-2xl border border-border-subtle p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <b className="block text-sm">{courseTitle}</b>
          <span className="break-all text-xs text-muted">{url}</span>
          <div className="mt-3 flex gap-2">
            <button onClick={copy} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white">
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
          <div className="mt-3 flex gap-4 text-[11px] text-muted">
            <span><b className="text-ink">{link.viewCount || 0}</b> views</span>
            <span><b className="text-ink">{link.clickCount || 0}</b> clicks</span>
            <span><b className="text-ink">{link.registrationCount || 0}</b> registrations</span>
          </div>
        </div>
        {qrImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrImage} alt="Promotion QR code" className="h-24 w-24 shrink-0" />
        )}
      </div>
      {leads.length > 0 && (
        <div className="mt-4 border-t border-border-subtle pt-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-subtle">Leads</p>
          <div className="space-y-1">
            {leads.map((lead) => (
              <div key={lead.id} className="flex justify-between text-xs text-muted">
                <span>{lead.name}</span>
                <span className="text-subtle">{lead.email}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PromoteView({ data, teacherId }) {
  const [links, setLinks] = useState([]);
  const [leads, setLeads] = useState([]);
  const [courseId, setCourseId] = useState(data.courses[0]?.id || "");
  const [creating, setCreating] = useState(false);

  useEffect(() => subscribeTeacherPromotionLinks(teacherId, setLinks, () => {}), [teacherId]);
  useEffect(() => subscribeTeacherLeads(teacherId, setLeads, () => {}), [teacherId]);

  async function generate() {
    if (!courseId) return;
    setCreating(true);
    try {
      await createPromotionLink(teacherId, courseId);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Panel
      title="Promote your training"
      action={
        <div className="flex gap-2">
          <select
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            className="rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs"
          >
            <option value="">Select training</option>
            {data.courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
          <button
            onClick={generate}
            disabled={!courseId || creating}
            className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
          >
            {creating ? "Generating..." : "Generate link"}
          </button>
        </div>
      }
    >
      {links.length ? (
        <div className="space-y-4">
          {links.map((link) => (
            <PromotionLinkCard
              key={link.id}
              link={link}
              courseTitle={data.courses.find((course) => course.id === link.courseId)?.title || link.courseId}
              leads={leads.filter((lead) => lead.linkId === link.id)}
            />
          ))}
        </div>
      ) : (
        <Empty>No promotion links yet. Pick a training and generate one.</Empty>
      )}
    </Panel>
  );
}

const SCANNER_ELEMENT_ID = "teacher-qr-scanner";

function ScanQrView({ data }) {
  const [classId, setClassId] = useState(data.classes[0]?.id || "");
  const [sessionId, setSessionId] = useState("");
  // Optional: today's real scheduled sessions for the selected class, so a
  // scan can be tagged with the correct session/location — see
  // /api/class-sessions. Falls back to plain class-only scanning (exactly
  // as before) when nothing is scheduled.
  const [sessions, setSessions] = useState([]);
  const courseIdForClass = data.classes.find((item) => item.id === classId)?.courseId || "";
  useEffect(() => {
    if (!courseIdForClass) return undefined;
    return subscribeCourseClassSessions(courseIdForClass, setSessions, () => {});
  }, [courseIdForClass]);
  // Filtered by the current classId rather than reset in the effect above
  // (no course selected simply means classId won't match anything here).
  const todaySessions = sessions.filter((item) => item.classId === classId && item.date === new Date().toISOString().slice(0, 10) && item.status !== "cancelled");
  const [scanning, setScanning] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const scannerRef = useRef(null);

  async function handleToken(token) {
    if (!classId || !token || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await scanAttendanceQr({ token, classId, ...(sessionId ? { sessionId } : {}) });
      setResult({ ok: true, ...response });
    } catch (error) {
      setResult({ ok: false, message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function startScanning() {
    setCameraError("");
    setResult(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 220 },
        async (decodedText) => {
          await scanner.stop().catch(() => {});
          setScanning(false);
          handleToken(decodedText);
        },
        () => {},
      );
      setScanning(true);
    } catch (error) {
      setCameraError(
        error?.message?.includes("Permission")
          ? "Camera permission was denied. Use manual entry below instead."
          : "Unable to access the camera. Use manual entry below instead.",
      );
    }
  }

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, [scannerRef]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_.8fr]">
      <Panel
        title="Scan a student QR code"
        action={
          <div className="flex flex-wrap gap-2">
            <select
              value={classId}
              onChange={(event) => {
                setClassId(event.target.value);
                setSessionId("");
              }}
              className="rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs"
            >
              <option value="">Select class</option>
              {data.classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || item.id}
                </option>
              ))}
            </select>
            {classId && todaySessions.length > 0 && (
              <select
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value)}
                className="rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs"
              >
                <option value="">No specific session</option>
                {todaySessions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} · {item.startTime}–{item.endTime}
                  </option>
                ))}
              </select>
            )}
          </div>
        }
      >
        {!classId ? (
          <Empty>Select a class before scanning.</Empty>
        ) : (
          <>
            <div id={SCANNER_ELEMENT_ID} className="mx-auto max-w-sm overflow-hidden rounded-2xl bg-slate-900" />
            {!scanning && (
              <button
                onClick={startScanning}
                className="mt-4 w-full rounded-xl bg-primary py-3 text-xs font-bold text-white"
              >
                Start camera scan
              </button>
            )}
            {cameraError && <p className="mt-3 text-xs text-primary">{cameraError}</p>}
            <div className="mt-5 border-t border-border-subtle pt-4">
              <p className="mb-2 text-xs font-semibold text-muted">
                Camera denied? Paste the QR token manually:
              </p>
              <div className="flex gap-2">
                <input
                  value={manualToken}
                  onChange={(event) => setManualToken(event.target.value)}
                  placeholder="Scanned token"
                  className="flex-1 rounded-xl border border-border-subtle px-3 py-2 text-xs"
                />
                <button
                  onClick={() => handleToken(manualToken)}
                  disabled={busy || !manualToken}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
                >
                  Submit
                </button>
              </div>
            </div>
          </>
        )}
      </Panel>
      <Panel title="Result">
        {busy ? (
          <Empty>Checking QR code...</Empty>
        ) : !result ? (
          <Empty>Scan a QR code to see the result here.</Empty>
        ) : result.ok ? (
          <div className={`rounded-2xl p-4 text-sm ${result.code === "already_checked_out" ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>
            <b className="block">{result.message}</b>
            {result.student && (
              <p className="mt-2 text-xs">
                {result.student.displayName || result.student.email}
              </p>
            )}
            {result.code === "checked_out" && typeof result.durationMinutes === "number" && (
              <p className="mt-1 text-xs font-semibold">
                Session length: {Math.floor(result.durationMinutes / 60)}h {result.durationMinutes % 60}m
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-active p-4 text-sm text-primary">{result.message}</div>
        )}
      </Panel>
    </div>
  );
}

export default function TeacherWorkspacePage({ module = "Dashboard" }) {
  const router = useRouter();
  const { user, profile, loading: authLoading } = useAuth();
  const [data, setData] = useState(blank);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (module === "Training" || authLoading || profile?.role !== "Teacher" || !user?.uid) return undefined;
    const update = (key) => (value) => {
      setData((current) => ({ ...current, [key]: value }));
      setLoading(false);
    };
    return subscribeTeacherDashboard(user.uid, {
      classes: update("classes"),
      students: update("students"),
      courses: update("courses"),
      assignments: update("assignments"),
      submissions: update("submissions"),
      attendance: update("attendance"),
      events: update("events"),
      activities: update("activities"),
      achievements: update("achievements"),
      certificates: update("certificates"),
      conversations: update("conversations"),
      notifications: update("notifications"),
      error: (firebaseError, collectionName) => {
        console.error("[teacher-workspace] data load failed", firebaseError);
        setError(
          `Unable to load teacher data (${collectionName}: ${firebaseError.code}).`,
        );
        setLoading(false);
      },
    });
  }, [authLoading, module, profile?.role, user?.uid]);
  const unread = useMemo(
    () =>
      data.conversations.reduce(
        (total, conversation) => total + Number(conversation.unreadCount?.[user?.uid] || 0),
        0,
      ),
    [data.conversations, user?.uid],
  );
  const content = module === "Training" ? (
    <TrainingManagement role="Teacher" />
  ) : loading ? (
    <Empty>Loading teacher data...</Empty>
  ) : error ? (
    <Empty>{error}</Empty>
  ) : module === "Dashboard" ? (
    <DashboardView data={data} />
  ) : module === "Students" ? (
    <StudentsView data={data} />
  ) : module === "Training" ? (
    <TrainingView data={data} />
  ) : module === "Attendance" ? (
    <AttendanceView data={data} teacherId={user.uid} />
  ) : module === "Event" ? (
    <EventsView data={data} teacherId={user.uid} />
  ) : module === "Events" ? (
    <StudentEvents />
  ) : module === "My Shop" ? (
    <Shop role="Teacher" uid={user.uid} />
  ) : module === "Achievement" ? (
    <AchievementsView data={data} teacherId={user.uid} />
  ) : module === "Model Test" ? (
    <TeacherExams teacherId={user.uid} />
  ) : module === "Certificates" ? (
    <CertificatesView data={data} teacherId={user.uid} />
  ) : module === "Assignments" ? (
    <ScopedRecordsView title="Assignments" records={data.assignments} empty="No assignments found for your assigned classes." />
  ) : module === "Submissions" ? (
    <ScopedRecordsView title="Submissions" records={data.submissions} empty="No submissions found for your assigned classes." />
  ) : module === "Results" ? (
    <ScopedRecordsView title="Results" records={data.submissions.filter((item) => item.score != null)} empty="No graded results found." />
  ) : module === "Notifications" ? (
    <Panel title="Notifications">
      <NotificationList
        items={data.notifications}
        onItemClick={(item) => !item.readAt && markNotificationRead(item.id)}
      />
    </Panel>
  ) : module === "Profile" ? (
    <ProfileView user={user} profile={profile} />
  ) : module === "ID Card" ? (
    <section className="rounded-3xl border border-border-subtle/70 bg-card p-5 shadow-sm md:p-8">
      <div className="mb-6 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Digital Membership</p>
        <h2 className="mt-1 text-2xl font-black text-ink sm:text-3xl">Your ID Card</h2>
        <p className="mx-auto mt-2 max-w-md text-xs text-muted sm:text-sm">
          Keep this ready at events and training — first scan checks you in, second scan checks you out and credits your hours.
        </p>
      </div>
      <IdCardPrint
        mode="self"
        roleLabel="Teacher"
        fallbackName={profile?.displayName || user.email}
        fallbackEmail={user.email}
        photoURL={profile?.photoURL}
        active={profile?.active}
        status={profile?.status}
        onEditProfile={() => router.push(paths.Settings)}
      />
    </section>
  ) : module === "Scan QR Code" ? (
    <ScanQrView data={data} teacherId={user.uid} />
  ) : module === "Documents" ? (
    <DocumentsModule role={profile?.role === "Facilitator" ? "Facilitator" : "Teacher"} />
  ) : module === "Promote" ? (
    <PromoteView data={data} teacherId={user.uid} />
  ) : module === "Chat" ? (
    <ChatWorkspace
      currentUserId={user.uid}
      currentUserRole="Teacher"
      currentUserName={profile?.displayName || user.email}
    />
  ) : module === "Settings" ? (
    <SettingsPage />
  ) : (
    <Empty>Module not found.</Empty>
  );
  return (
    <TeacherGate>
      <TeacherShell active={module} unread={unread}>
        {content}
      </TeacherShell>
    </TeacherGate>
  );
}
