"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight, ChevronUp, Circle, FileText, Link2, Pencil, PlayCircle, Trash2, Type } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuth } from "../../lib/auth-context";
import AttendanceStatusPicker from "./AttendanceStatusPicker";
import ClassSessionsPanel from "./ClassSessionsPanel";
import { subscribeCourseClassSessions } from "../../lib/class-sessions-data";
import {
  listClassEnrollments,
  saveAttendance,
  subscribeTeacherCourseAttendance,
  subscribeTeacherCourseClasses,
} from "../../lib/teacher-data";
import {
  loadUsersByIds,
  subscribeClassAttendance,
  subscribeCourse,
  subscribeCourseClasses,
} from "../../lib/training-detail";
import { updateCourse } from "../../lib/services/training-service";
import { attendancePercent } from "../../lib/attendance";
import { loadTeacherAssignmentData } from "../../lib/services/teacher-assignment-service";
import { loadEnrollments } from "../../lib/services/enrollment-service";
import { loadTeacherEnrollments } from "../../lib/services/teacher-enrollment-service";
import {
  createAssessment,
  subscribeCourseAssessments,
} from "../../lib/teacher-assessments";
import { checkCertificateEligibility } from "../../lib/teacher-data";
import { stopEnterSubmit } from "../../lib/ui/keyboard";
import { TeacherShell } from "../TeacherWorkspacePage";
import DirectorShell from "../dashboard/DirectorShell";
import AdminShell from "../dashboard/AdminShell";
import WorkspaceShell from "../dashboard/WorkspaceShell";
import { SkeletonBar } from "../ui/Skeleton";
import EnrollmentManager from "./EnrollmentManager";
import DocumentsModule from "../documents/DocumentsModule";
import DataTable, { StatusBadge as TableBadge } from "../data-table/DataTable";
import StudentCourseLearningView from "./StudentCourseLearningView";
import LessonContentViewer from "./LessonContentViewer";
import {
  createLesson,
  createModule,
  deleteLesson,
  deleteModule,
  subscribeLessons,
  subscribeModules,
  swapLessonOrder,
  swapModuleOrder,
  updateLesson,
  updateModule,
} from "../../lib/course-modules-data";
import { uploadLessonContent } from "../../lib/services/lesson-content-service";

// Same Admin/Director module list used by app/dashboard/[role]/page.jsx's
// roleConfig.Director/Admin — duplicated here (a static, rarely-changing
// sidebar list) rather than importing from that page module, matching how
// Teacher's own sidebar list is already independently defined in
// TeacherWorkspacePage.js.
const managerModules = [
  "Dashboard",
  "Students",
  "Teacher",
  "Training",
  "Event",
  "Finance",
  "Documents",
  "My Shop",
  "User",
  "Chat",
  "Achievement",
  "ID Card",
  "Scan QR Code",
];

const managerTabs = [
  "Overview",
  "Teachers",
  "Classes",
  "Students",
  "Attendance",
  "Modules",
  "Materials",
  "Assign",
];
const teacherTabs = [
  "Overview",
  "Students",
  "Classes",
  "Attendance",
  "Modules",
  "Assessment",
  "Materials",
];

function Empty({ children }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-subtle bg-card p-8 text-center text-sm text-muted">
      {children}
    </div>
  );
}
function Panel({ title, children, action }) {
  return (
    <section className="rounded-3xl border border-border-subtle bg-card p-7 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
function Field({ label, value }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ink">{value || "—"}</dd>
    </div>
  );
}
const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString() : "—";
const friendlyError = (err) =>
  err?.code === "permission-denied"
    ? "You do not have access to this training."
    : err?.message || "Unable to load this training.";

// Perceived-speed only — mirrors the real header + tab nav + Overview
// panel shape below so there's no layout jump once the real course/
// enrollment data resolves. Reused for both the initial page load and the
// brief "checking your enrollment" moment, since both render at the same
// spot in the same parent.
function TrainingDetailsSkeleton() {
  return (
    <div className="mt-6">
      <div className="rounded-3xl border border-border-subtle bg-card p-6 shadow-sm">
        <SkeletonBar className="h-2.5 w-40" />
        <SkeletonBar className="mt-3 h-9 w-2/3" />
        <SkeletonBar className="mt-3 h-4 w-1/2" />
      </div>
      <div className="my-5 h-12 animate-pulse rounded-2xl border border-border-subtle bg-card" />
      <div className="rounded-3xl border border-border-subtle bg-card p-7 shadow-sm">
        <SkeletonBar className="mb-5 h-5 w-32" />
        <div className="grid gap-x-12 gap-y-6 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <SkeletonBar className="h-2.5 w-20" />
              <SkeletonBar className="h-4 w-28" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function TrainingDetailsPage() {
  const { user, profile, loading: authLoading, logout } = useAuth();
  const { courseId } = useParams();
  const [tab, setTab] = useState("Overview");
  const [course, setCourse] = useState(null);
  const [classes, setClasses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [studentEnrolled, setStudentEnrolled] = useState(null); // null = still checking

  const canManage = profile?.role === "Admin" || profile?.role === "Director";
  const isAssignedTeacher =
    profile?.role === "Teacher" && course?.teacherIds?.includes(user?.uid);
  const allowed = canManage || isAssignedTeacher;
  const tabs = canManage ? managerTabs : teacherTabs;

  // A Student never gets the manager/teacher tabs above — instead, once we
  // know they have an active (non-withdrawn) enrollment for this exact
  // course, they see the read-only StudentCourseLearningView further down.
  // One-time getDoc, not a subscription: enrollment status changing while
  // this page is open is not a real scenario worth a live listener for.
  useEffect(() => {
    // Non-Students never read studentEnrolled (every use below is guarded
    // by profile?.role === "Student" first), so there is nothing to do or
    // set for them here — no need for a synchronous setState in that case.
    if (profile?.role !== "Student" || !courseId || !user?.uid) return undefined;
    let cancelled = false;
    getDoc(doc(db, "enrollments", `${courseId}_${user.uid}`))
      .then((snapshot) => {
        if (cancelled) return;
        const data = snapshot.data();
        setStudentEnrolled(Boolean(snapshot.exists() && data?.status !== "withdrawn"));
      })
      .catch(() => {
        if (!cancelled) setStudentEnrolled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.role, courseId, user?.uid]);

  useEffect(() => {
    if (!courseId) return undefined;
    const fail = (err) => {
      console.error("[training-details] load failed", err);
      setError(friendlyError(err));
      setLoading(false);
    };
    return subscribeCourse(
      courseId,
      (item) => {
        setCourse(item);
        setLoading(false);
      },
      fail,
    );
  }, [courseId]);

  // Classes must be queried differently per role: the `classes` security
  // rule for a Teacher checks resource.data.teacherIds — a field that isn't
  // part of a plain `where("courseId","==",courseId)` filter, so Firestore
  // rejects that whole list query for a Teacher even though the actual
  // class document would individually pass the rule. Admin/Director aren't
  // affected (their `admin()` rule branch doesn't depend on per-document
  // data), so only the Teacher path needs the teacherIds-filtered query —
  // reusing the exact helper TeacherCoursePage.js already uses successfully.
  useEffect(() => {
    if (!courseId || authLoading || !profile?.role) return undefined;
    const fail = (err) =>
      console.error("[training-details] classes load failed", err);
    if (profile.role === "Teacher") {
      return subscribeTeacherCourseClasses(
        user?.uid,
        courseId,
        setClasses,
        fail,
      );
    }
    return subscribeCourseClasses(courseId, setClasses, fail);
  }, [courseId, authLoading, profile?.role, user?.uid]);

  // Legacy trainings (created before classes were auto-created) can have
  // teacherIds but no linked class yet. Poking either enrollment endpoint
  // once self-heals that — see ensurePrimaryClass in lib/server/enrollment-
  // core.js — regardless of which tab the teacher happens to open first.
  useEffect(() => {
    if (!course?.id || !profile?.role) return;
    const loader = canManage
      ? loadEnrollments
      : profile.role === "Teacher"
        ? loadTeacherEnrollments
        : null;
    loader?.(course.id).catch(() => {});
  }, [course?.id, profile?.role, canManage]);

  const classIds = useMemo(() => classes.map((item) => item.id), [classes]);

  useEffect(() => {
    let cancelled = false;
    async function loadClassEnrollments() {
      if (!classIds.length) {
        setEnrollments([]);
        return;
      }
      const groups = await Promise.all(
        classIds.map((id) => listClassEnrollments(id)),
      );
      if (!cancelled)
        setEnrollments(
          groups.flat().filter((item) => item.status !== "withdrawn"),
        );
    }
    loadClassEnrollments();
    return () => {
      cancelled = true;
    };
  }, [classIds]);

  useEffect(() => {
    let cancelled = false;
    const studentIds = enrollments
      .map((item) => item.studentId)
      .filter(Boolean);
    loadUsersByIds(studentIds).then((rows) => {
      if (!cancelled) setStudents(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [enrollments]);

  // Same rule-vs-query-shape issue as classes above: the attendance rule
  // checks resource.data.teacherId, not classId, so a Teacher's list query
  // must filter on teacherId+courseId (the already-proven pattern) rather
  // than classId alone.
  useEffect(() => {
    if (authLoading || !profile?.role) return undefined;
    if (profile.role === "Teacher") {
      if (!user?.uid || !courseId) return undefined;
      return subscribeTeacherCourseAttendance(
        user.uid,
        courseId,
        setAttendance,
        () => {},
      );
    }
    return subscribeClassAttendance(classIds, setAttendance, () => {});
  }, [classIds, authLoading, profile?.role, user?.uid, courseId]);

  const body = (
    <div className=" px-2 ">
      <Link
        href={
          profile?.role === "Teacher"
            ? "/teacher/training"
            : `/dashboard/${(profile?.role || "admin").toLowerCase()}`
        }
        className="mb-6 inline-block text-xs font-semibold text-primary"
      >
        ← Back to Training
      </Link>
      {authLoading || loading ? (
        <TrainingDetailsSkeleton />
      ) : error ? (
        <div className="mt-6">
          <Empty>{error}</Empty>
        </div>
      ) : !course ? (
        <div className="mt-6">
          <Empty>Training not found</Empty>
        </div>
      ) : !allowed && profile?.role === "Student" && studentEnrolled === null ? (
        <TrainingDetailsSkeleton />
      ) : !allowed && profile?.role === "Student" && studentEnrolled ? (
        <div className="mt-6">
          <header className="rounded-2xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-4 text-ink shadow-sm md:p-5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
              {course.courseCode || course.id} · Offline Training
            </p>
            <h1 className="mt-1 text-lg font-black md:text-xl">{course.title}</h1>
            <p className="mt-1 max-w-2xl text-xs text-muted">{course.description || "No description available."}</p>
          </header>
          <div className="mt-5">
            <StudentCourseLearningView course={course} courseId={course.id} uid={user.uid} />
          </div>
        </div>
      ) : !allowed ? (
        <div className="mt-6">
          <Empty>You do not have access to this training.</Empty>
        </div>
      ) : (
        <>
          <header className="rounded-2xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-4 text-ink shadow-sm md:p-5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
              {course.courseCode || course.id} · Offline Training
            </p>
            <h1 className="mt-1 text-lg font-black md:text-xl">
              {course.title}
            </h1>
            <p className="mt-1 max-w-2xl text-xs text-muted">
              {course.description || "No description available."}
            </p>
          </header>

          <nav className="my-5 flex gap-2 overflow-x-auto rounded-2xl border border-border-subtle bg-card p-1.5 shadow-sm">
            {tabs.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${tab === item ? "bg-primary text-white" : "text-muted hover:bg-active"}`}
              >
                {item}
              </button>
            ))}
          </nav>

          {tab === "Overview" && (
            <Panel title="Overview">
              <dl className="grid gap-x-12 gap-y-6 sm:grid-cols-3">
                <Field label="Status" value={course.status} />
                <Field label="Category" value={course.category} />
                <Field label="Level" value={course.level} />
                <Field label="Training Type" value="Offline" />
                <Field
                  label="Start / End Date"
                  value={`${formatDate(course.startDate)} – ${formatDate(course.endDate)}`}
                />
                <Field
                  label="Time"
                  value={
                    course.startTime && course.endTime
                      ? `${course.startTime}–${course.endTime}`
                      : "—"
                  }
                />
                <Field label="Duration" value={course.duration} />
                <Field label="Class Frequency" value={course.classFrequency} />
                <Field label="Total Classes" value={course.totalClasses} />
                <Field
                  label="Campus / Building"
                  value={[course.campus, course.building]
                    .filter(Boolean)
                    .join(", ")}
                />
                <Field
                  label="Room / Floor"
                  value={[course.room, course.floor].filter(Boolean).join(", ")}
                />
                <Field label="Batch Name" value={course.batchName} />
                <Field
                  label="Max Students / Seat Capacity"
                  value={`${course.maxStudents ?? "—"} / ${course.seatCapacity ?? "—"}`}
                />
                <Field
                  label="Enrollment Window"
                  value={`${formatDate(course.enrollmentStartDate)} – ${formatDate(course.enrollmentDeadline)}`}
                />
                <Field
                  label="Enrollment Status"
                  value={course.enrollmentStatus}
                />
                <Field label="Passing Score" value={course.passingScore} />
                <Field
                  label="Certificate"
                  value={
                    course.certificateEnabled
                      ? `Enabled (min ${course.certificateMinAttendance ?? 0}% attendance, ${course.certificateMinScore ?? 0} score)`
                      : "Disabled"
                  }
                />
                {course.certificateEnabled && (
                  <Field label="Certificate Code" value={course.certificateCode || "—"} />
                )}
              </dl>
            </Panel>
          )}

          {tab === "Teachers" && <TeachersTab course={course} />}

          {tab === "Classes" && (
            <Panel title="Classes / Batches">
              {classes.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {classes.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-border-subtle p-4"
                    >
                      {/* The batch/group record's own real name is the
                          title here — no synthetic "Class {n}"/"Batch {n}"
                          ordinal tag. That tag used to read "Class {n}",
                          which collided with the unrelated real Class
                          Session feature below (ClassSessionsPanel) and
                          made this purely cosmetic, non-editable label
                          look like a phantom, action-less "Class 1"
                          session. Removed; no data changed, `index` is no
                          longer needed here. */}
                      <b className="block text-sm">{item.name || "Batch"}</b>
                      <span className="text-xs text-muted">
                        {[item.campus, item.building, item.floor, item.room]
                          .filter(Boolean)
                          .join(", ") || "No room set"}
                      </span>
                      <p className="mt-2 text-xs text-muted">
                        {formatDate(item.startDate)} –{" "}
                        {formatDate(item.endDate)}
                        {item.startTime && item.endTime
                          ? ` · ${item.startTime}–${item.endTime}`
                          : ""}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-muted">
                        {
                          enrollments.filter((e) => e.classId === item.id)
                            .length
                        }{" "}
                        student(s) enrolled
                        {item.maxStudents ? ` / max ${item.maxStudents}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty>No classes found for this training</Empty>
              )}
              {classes.length > 0 && (
                <ClassSessionsPanel
                  course={course}
                  classes={classes}
                  canManage={canManage}
                  isAssignedTeacher={isAssignedTeacher}
                  currentUid={user?.uid}
                />
              )}
            </Panel>
          )}

          {tab === "Students" && (
            <Panel title="Students">
              <EnrollmentManager
                mode={canManage ? "manage" : "teacher"}
                courseId={course.id}
                courseTitle={course.title}
                courseCode={course.courseCode || course.id}
                attendance={attendance}
                classroomInfo={
                  canManage
                    ? undefined
                    : {
                        campus: course.campus,
                        building: course.building,
                        floor: course.floor,
                        room: course.room,
                        batchName: course.batchName,
                        schedule: course.classFrequency,
                      }
                }
              />
            </Panel>
          )}

          {tab === "Attendance" && (
            <AttendanceTab
              courseId={course.id}
              classes={classes}
              students={students}
              attendance={attendance}
              // Director/Admin can already manage everything else on this
              // page (Students, Training, Assessment) — Attendance was the
              // one tab where the mark-attendance grid was gated to an
              // assigned Teacher only, even though canManage() already
              // grants full access here and the existing `attendance`
              // Firestore rule already has an unconditional admin() branch.
              // When Director/Admin marks it, `teacherId` is recorded as
              // the course's real assigned teacher (not the Director's own
              // uid) so the record still shows up correctly in that
              // teacher's own dashboard/attendance views — same field,
              // same collection, no new attendance system.
              teacherId={isAssignedTeacher ? user?.uid : (course.primaryTeacherId || user?.uid)}
              canMark={isAssignedTeacher || canManage}
            />
          )}
          {tab === "Assessment" && (
            <AssessmentTab
              courseId={course.id}
              students={students}
              teacherId={user?.uid}
              classId={course.primaryClassId}
            />
          )}
          {tab === "Modules" && <ModulesTab courseId={course.id} canEdit={canManage || isAssignedTeacher} />}
          {tab === "Materials" && (
            <DocumentsModule
              role={profile?.role || "Teacher"}
              courseId={course.id}
              courseName={course.title}
            />
          )}
          {tab === "Assign" && canManage && <AssignTab course={course} />}
          {tab === "Assign" && !canManage && (
            <Panel title="Assign">
              <Empty>Only Admin or Director can reassign teachers.</Empty>
            </Panel>
          )}
        </>
      )}
    </div>
  );

  // -mx-4 cancels out the shell's own px-4 content padding so this page
  // alone sits flush to the shell's edges, without touching the shell
  // itself (every other page under that shell still relies on its px-4).
  const paddedBody = <div className="-mx-4">{body}</div>;

  // While auth/profile is still resolving (only ever happens for a moment
  // on a hard refresh/direct link to this page — client-side navigation
  // from inside an already-signed-in dashboard has `profile` cached and
  // skips this entirely), `profile?.role` isn't known yet, so none of the
  // three role branches below can be picked correctly. Previously this fell
  // through to a bare, shell-less <main> — a real full-screen loading flash
  // with no sidebar/header. WorkspaceShell is the exact same base every
  // real shell below already renders on top of (TeacherShell/DirectorShell/
  // AdminShell are all thin wrappers around it), so showing it here first
  // means the sidebar/header chrome is present immediately and never pops
  // in — only its nav items/name fill in once the real role is known, a
  // moment later, when one of the branches below takes over.
  if (authLoading) {
    return (
      <WorkspaceShell
        modules={[]}
        active="Training"
        name=""
        initials=""
        userEmail=""
        headerTitle="Training"
        headerSubtitle="Loading..."
        onLogout={logout}
      >
        {paddedBody}
      </WorkspaceShell>
    );
  }

  if (profile?.role === "Teacher") {
    return <TeacherShell active="Training">{paddedBody}</TeacherShell>;
  }

  if (profile?.role === "Director") {
    const name = profile?.displayName || user?.displayName || user?.email?.split("@")[0] || "Director";
    return (
      <DirectorShell
        modules={managerModules}
        active="Training"
        getHref={() => "/dashboard/director"}
        name={name}
        initials={name.slice(0, 2).toUpperCase()}
        userEmail={user?.email}
        headerTitle="Training"
        headerSubtitle="Organization overview"
        onLogout={logout}
      >
        {paddedBody}
      </DirectorShell>
    );
  }

  if (profile?.role === "Admin") {
    const name = profile?.displayName || user?.displayName || user?.email?.split("@")[0] || "Member";
    return (
      <AdminShell
        role="Admin"
        modules={managerModules}
        active="Training"
        getHref={() => "/dashboard/admin"}
        name={name}
        initials={name.slice(0, 2).toUpperCase()}
        userEmail={user?.email}
        headerTitle="Training"
        onLogout={logout}
      >
        {paddedBody}
      </AdminShell>
    );
  }

  return (
    <main className="min-h-screen bg-page text-ink">{body}</main>
  );
}

function TeachersTab({ course }) {
  const [teacherRows, setTeacherRows] = useState([]);
  useEffect(() => {
    const ids = [course.primaryTeacherId, course.assistantTeacherId].filter(
      Boolean,
    );
    let cancelled = false;
    loadUsersByIds(ids).then((rows) => {
      if (!cancelled) setTeacherRows(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [course.primaryTeacherId, course.assistantTeacherId]);
  const nameFor = (id) => {
    const teacher = teacherRows.find((item) => item.id === id);
    return teacher?.displayName || teacher?.email || "Not assigned";
  };
  // Pure render-time derivation (not new state) — teacherRows starts empty
  // and fills in once loadUsersByIds resolves above, so "has an id but no
  // rows yet" is exactly "still loading" for this small inline lookup.
  const isLoadingName = (id) => Boolean(id) && teacherRows.length === 0;
  return (
    <Panel title="Teachers">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-page p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">
            Primary Teacher
          </p>
          <p className="mt-1 text-sm font-semibold">
            {isLoadingName(course.primaryTeacherId) ? <SkeletonBar className="h-4 w-32" /> : nameFor(course.primaryTeacherId)}
          </p>
        </div>
        <div className="rounded-2xl bg-page p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">
            Assistant Teacher
          </p>
          <p className="mt-1 text-sm font-semibold">
            {course.assistantTeacherId
              ? (isLoadingName(course.assistantTeacherId) ? <SkeletonBar className="h-4 w-32" /> : nameFor(course.assistantTeacherId))
              : "None"}
          </p>
        </div>
      </div>
      <p className="mt-4 text-xs text-muted">
        To change teachers, use the Assign tab.
      </p>
    </Panel>
  );
}

function AttendanceTab({
  courseId,
  classes,
  students,
  attendance,
  teacherId,
  canMark,
}) {
  // Optional: pick a real, pre-scheduled Class Session instead of a
  // freeform class+date — auto-fills class/date/location and tags the
  // saved attendance records with sessionId, so they're associated with
  // the correct real session (per the offline-class feature). The manual
  // class+date pickers below are kept exactly as before for ad-hoc
  // marking when no session was scheduled in advance.
  const [sessions, setSessions] = useState([]);
  useEffect(() => subscribeCourseClassSessions(courseId, setSessions, () => {}), [courseId]);
  const [sessionId, setSessionId] = useState("");
  const selectedSession = sessions.find((item) => item.id === sessionId) || null;

  const [manualClassId, setManualClassId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Derived, not synced via an effect: whenever `classes` loads or changes,
  // this simply falls back to the first class until the user manually picks
  // one — no setState-during-render/effect needed.
  const classId = selectedSession
    ? selectedSession.classId
    : manualClassId && classes.some((item) => item.id === manualClassId)
      ? manualClassId
      : classes[0]?.id || "";
  const effectiveDate = selectedSession ? selectedSession.date : date;

  const studentName = (id) => {
    const s = students.find((item) => item.id === id);
    return s?.displayName || s?.email || id || "—";
  };
  const className = (id) => classes.find((item) => item.id === id)?.name || id || "—";

  const rate = useMemo(() => {
    return students.reduce((result, student) => {
      result[student.id] = attendancePercent(
        attendance.filter((item) => item.studentId === student.id),
      );
      return result;
    }, {});
  }, [attendance, students]);

  // Most recently marked status per student (by date), so the summary
  // reflects what was just saved in plain words, not just a rolled-up rate.
  const latestStatus = useMemo(() => {
    return students.reduce((result, student) => {
      const records = attendance
        .filter((item) => item.studentId === student.id)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      if (records.length) result[student.id] = records[0].status;
      return result;
    }, {});
  }, [attendance, students]);

  return (
    <Panel
      title="Attendance"
      action={
        canMark && (
          <div className="flex flex-wrap gap-2">
            {sessions.length > 0 && (
              <select
                value={sessionId}
                onChange={(event) => setSessionId(event.target.value)}
                className="rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs"
              >
                <option value="">Manual (pick class + date below)</option>
                {sessions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} · {item.date}
                  </option>
                ))}
              </select>
            )}
            <select
              value={classId}
              onChange={(event) => setManualClassId(event.target.value)}
              disabled={Boolean(selectedSession)}
              className="rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs disabled:opacity-50"
            >
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name || item.id}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={effectiveDate}
              onChange={(event) => setDate(event.target.value)}
              disabled={Boolean(selectedSession)}
              onKeyDown={stopEnterSubmit}
              className="rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs disabled:opacity-50"
            />
          </div>
        )
      }
    >
      {!classes.length ? (
        <Empty>No classes found for this training</Empty>
      ) : !students.length ? (
        <Empty>No enrolled students found</Empty>
      ) : (
        <>
          {canMark && (
            <AttendanceMarkGrid
              key={`${classId}_${effectiveDate}_${sessionId}`}
              courseId={courseId}
              classId={classId}
              date={effectiveDate}
              sessionId={selectedSession?.id || null}
              location={selectedSession?.location || ""}
              students={students}
              attendance={attendance}
              teacherId={teacherId}
            />
          )}
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-subtle">
            Attendance summary
          </p>
          <div className="space-y-2">
            {students.map((student) => {
              const status = latestStatus[student.id];
              const label = status
                ? status[0].toUpperCase() + status.slice(1)
                : "No attendance yet";
              return (
                <div
                  key={student.id}
                  className="flex items-center justify-between rounded-xl bg-page p-3 text-xs"
                >
                  <b>{student.displayName || student.email}</b>
                  <span className="font-bold text-primary">
                    {status && rate[student.id] != null
                      ? `${label} · ${rate[student.id]}%`
                      : label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-6">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-subtle">All attendance records</p>
            <DataTable
              title="attendance"
              name={`attendance-${courseId}`}
              columns={[
                { key: "student", header: "Student", sortable: true, accessor: (r) => studentName(r.studentId), render: (r) => <b className="text-ink">{studentName(r.studentId)}</b> },
                { key: "date", header: "Date", sortable: true, accessor: (r) => r.date || "" },
                { key: "status", header: "Status", sortable: true, filter: {}, accessor: (r) => (r.status ? r.status[0].toUpperCase() + r.status.slice(1) : ""), render: (r) => <TableBadge tone={{ present: "green", absent: "red", late: "orange", excused: "blue" }[r.status] || "gray"}>{r.status || "—"}</TableBadge> },
                { key: "class", header: "Class", sortable: true, filter: {}, accessor: (r) => className(r.classId) },
                { key: "markedByName", header: "Marked By", accessor: (r) => r.markedByName || r.teacherName || "" },
              ]}
              rows={attendance}
              getRowId={(r) => r.id || `${r.studentId}_${r.date}_${r.classId}`}
              initialSort={{ key: "date", dir: "desc" }}
              pageSize={10}
              emptyLabel="No attendance has been marked yet."
            />
          </div>
        </>
      )}
    </Panel>
  );
}

// Keyed by `${classId}_${date}` from the parent so switching class/date
// remounts this component — that's what resets `statuses` to match the
// newly-selected class/date's existing records, without needing an effect.
function AttendanceMarkGrid({
  courseId,
  classId,
  date,
  sessionId,
  location,
  students,
  attendance,
  teacherId,
}) {
  const [statuses, setStatuses] = useState(() => {
    const existing = {};
    attendance
      .filter((item) => item.classId === classId && item.date === date)
      .forEach((item) => {
        existing[item.studentId] = item.status;
      });
    return existing;
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    if (!classId || !date || !students.length) return;
    setSaving(true);
    setMessage("");
    try {
      await saveAttendance(
        teacherId,
        students.map((student) => ({
          id: `${classId}_${student.id}_${date}`,
          courseId,
          classId,
          studentId: student.id,
          date,
          status: statuses[student.id] || "present",
          // Only set when marking against a real, pre-scheduled Class
          // Session — plain manual marking (no session picked) keeps
          // writing the exact same record shape as before this feature.
          ...(sessionId ? { sessionId, location: location || "" } : {}),
        })),
      );
      setMessage("Attendance saved.");
    } catch (error) {
      setMessage(error.message || "Unable to save attendance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-5 space-y-2 border-b border-border-subtle pb-5">
      {students.map((student) => (
        <div
          key={student.id}
          className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-page p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
        >
          <b>{student.displayName || student.email}</b>
          <AttendanceStatusPicker
            value={statuses[student.id] || "present"}
            onChange={(status) => setStatuses({ ...statuses, [student.id]: status })}
          />
        </div>
      ))}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save Attendance"}
        </button>
        {message && <p className="text-xs text-muted">{message}</p>}
      </div>
    </div>
  );
}

const assessmentTypes = ["quiz", "assignment", "midterm", "final"];
const assessmentTypeLabels = {
  quiz: "Quiz",
  assignment: "Assignment",
  midterm: "Midterm Exam",
  final: "Final Exam",
};

function AssessmentTab({ courseId, students, teacherId, classId }) {
  const [records, setRecords] = useState([]);
  const [studentId, setStudentId] = useState("");
  const [type, setType] = useState("quiz");
  const [title, setTitle] = useState("");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("100");
  const [passingScore, setPassingScore] = useState("60");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(
    () => subscribeCourseAssessments(teacherId, courseId, setRecords, () => {}),
    [teacherId, courseId],
  );

  const studentName = (id) =>
    students.find((item) => item.id === id)?.displayName ||
    students.find((item) => item.id === id)?.email ||
    id;

  async function save() {
    if (!studentId || !title) return;
    setSaving(true);
    setMessage("");
    try {
      await createAssessment(teacherId, {
        studentId,
        courseId,
        classId,
        type,
        title,
        score,
        maxScore,
        passingScore,
      });
      setTitle("");
      setScore("");
      setMessage("Assessment recorded.");
      // A new score can be the moment the student crosses the course's
      // certificateMinScore threshold — re-check eligibility from real
      // data, never a manual student request.
      checkCertificateEligibility(studentId, courseId);
    } catch (error) {
      setMessage(error.message || "Unable to record assessment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Assessment">
      <div className="mb-5 grid gap-3 rounded-2xl bg-page p-4 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-bold text-muted">
          Student
          <select
            value={studentId}
            onChange={(event) => setStudentId(event.target.value)}
            className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
          >
            <option value="">Choose student</option>
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.displayName || student.email}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Type
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
          >
            {assessmentTypes.map((item) => (
              <option key={item} value={item}>
                {assessmentTypeLabels[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="col-span-full grid gap-1 text-xs font-bold text-muted">
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={stopEnterSubmit}
            placeholder="e.g. Chapter 3 Quiz"
            className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Score
          <input
            type="number"
            value={score}
            onChange={(event) => setScore(event.target.value)}
            onKeyDown={stopEnterSubmit}
            className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Maximum Score
          <input
            type="number"
            value={maxScore}
            onChange={(event) => setMaxScore(event.target.value)}
            onKeyDown={stopEnterSubmit}
            className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Passing Score
          <input
            type="number"
            value={passingScore}
            onChange={(event) => setPassingScore(event.target.value)}
            onKeyDown={stopEnterSubmit}
            className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal"
          />
        </label>
        <div className="col-span-full flex items-center justify-between">
          <button
            type="button"
            onClick={save}
            disabled={saving || !studentId || !title}
            className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
          >
            {saving ? "Saving..." : "Record Assessment"}
          </button>
          {message && <p className="text-xs text-muted">{message}</p>}
        </div>
      </div>

      {records.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b text-[10px] uppercase tracking-wider text-subtle">
              <tr>
                {["Student", "Type", "Title", "Score", "Passing", "Result"].map(
                  (label) => (
                    <th key={label} className="p-3">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {records
                .slice()
                .sort(
                  (a, b) =>
                    (b.createdAt?.toMillis?.() || 0) -
                    (a.createdAt?.toMillis?.() || 0),
                )
                .map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-border-subtle text-xs"
                  >
                    <td className="p-3">{studentName(record.studentId)}</td>
                    <td className="p-3">
                      {assessmentTypeLabels[record.type] || record.type}
                    </td>
                    <td className="p-3">{record.title}</td>
                    <td className="p-3">
                      {record.score ?? "—"} / {record.maxScore ?? "—"}
                    </td>
                    <td className="p-3">{record.passingScore ?? "—"}</td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${record.status === "pass" ? "bg-success-soft text-success" : "bg-active text-primary"}`}
                      >
                        {record.status === "pass" ? "Pass" : "Fail"}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No assessments recorded yet</Empty>
      )}
    </Panel>
  );
}

function AssignTab({ course }) {
  const [teachers, setTeachers] = useState([]);
  const [primaryTeacherId, setPrimaryTeacherId] = useState(
    course.primaryTeacherId || "",
  );
  const [assistantTeacherId, setAssistantTeacherId] = useState(
    course.assistantTeacherId || "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadTeacherAssignmentData()
      .then((result) => setTeachers(result.teachers || []))
      .catch(() => {});
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await updateCourse({
        id: course.id,
        title: course.title,
        description: course.description,
        status: course.status,
        category: course.category,
        level: course.level,
        thumbnailUrl: course.thumbnailUrl,
        thumbnailPath: course.thumbnailPath,
        startDate: course.startDate,
        endDate: course.endDate,
        startTime: course.startTime,
        endTime: course.endTime,
        duration: course.duration,
        classFrequency: course.classFrequency,
        totalClasses: course.totalClasses,
        campus: course.campus,
        building: course.building,
        room: course.room,
        floor: course.floor,
        batchName: course.batchName,
        maxStudents: course.maxStudents,
        seatCapacity: course.seatCapacity,
        enrollmentStartDate: course.enrollmentStartDate,
        enrollmentDeadline: course.enrollmentDeadline,
        enrollmentStatus: course.enrollmentStatus,
        passingScore: course.passingScore,
        certificateEnabled: course.certificateEnabled,
        certificateMinAttendance: course.certificateMinAttendance,
        certificateMinScore: course.certificateMinScore,
        certificateTemplateId: course.certificateTemplateId,
        certificateCode: course.certificateCode,
        primaryTeacherId,
        assistantTeacherId,
      });
      setMessage("Teachers updated.");
    } catch (error) {
      setMessage(error.message || "Unable to update teachers.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="Assign Teachers">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-bold text-muted">
          Primary Teacher
          <select
            value={primaryTeacherId}
            onChange={(event) => setPrimaryTeacherId(event.target.value)}
            className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
          >
            <option value="">Choose primary teacher</option>
            {teachers
              .filter((t) => t.id !== assistantTeacherId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName || t.email}
                </option>
              ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Assistant Teacher (optional)
          <select
            value={assistantTeacherId}
            onChange={(event) => setAssistantTeacherId(event.target.value)}
            className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
          >
            <option value="">None</option>
            {teachers
              .filter((t) => t.id !== primaryTeacherId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.displayName || t.email}
                </option>
              ))}
          </select>
        </label>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving || !primaryTeacherId}
        className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"
      >
        {saving ? "Saving..." : "Save assignment"}
      </button>
      {message && <p className="mt-3 text-xs text-muted">{message}</p>}
    </Panel>
  );
}

// -----------------------------------------------------------------------
// Modules tab — module + lesson authoring for Admin/Director/assigned
// Teacher (canEdit), read via lib/course-modules-data.js's direct Firestore
// listeners (the existing courses/{id}/modules/{id}/lessons/{id} rules
// already gate every read/write correctly — see the feature plan). File
// bytes for uploaded video/pdf/document content go through
// lib/services/lesson-content-service.js instead, never direct Storage.
// -----------------------------------------------------------------------
const CONTENT_TYPE_OPTIONS = [
  { value: "video", label: "Video" },
  { value: "pdf", label: "PDF" },
  { value: "document", label: "Document" },
  { value: "link", label: "External Resource" },
  { value: "text", label: "Text / Notes" },
  { value: "quiz", label: "Quiz / Exam (coming soon)" },
];
const CONTENT_ICON = { video: PlayCircle, pdf: FileText, document: FileText, link: Link2, text: Type, quiz: Circle };

// Same Framer Motion vocabulary as components/settings/SettingsPage.jsx —
// reused verbatim so the Modules UI's motion feels consistent with the rest
// of the app rather than inventing a new set of timings/easings.
const MODULES_EASE = [0.22, 1, 0.36, 1];
const modulesStagger = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } } };
const moduleCardMotion = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: MODULES_EASE } },
};
const lessonRowMotion = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: MODULES_EASE } },
};
const expandCollapse = {
  hidden: { opacity: 0, height: 0 },
  show: { opacity: 1, height: "auto", transition: { duration: 0.3, ease: MODULES_EASE } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.2, ease: MODULES_EASE } },
};

function ModulesTab({ courseId, canEdit }) {
  const [modules, setModules] = useState([]);
  const [addingModule, setAddingModule] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState("");
  const [moduleForm, setModuleForm] = useState({ title: "", description: "", estimatedDuration: "" });
  const [savingModule, setSavingModule] = useState(false);
  const [moduleError, setModuleError] = useState("");

  useEffect(() => subscribeModules(courseId, setModules, () => {}), [courseId]);

  function resetModuleForm() {
    setAddingModule(false);
    setEditingModuleId("");
    setModuleForm({ title: "", description: "", estimatedDuration: "" });
    setModuleError("");
  }

  function startEditModule(module) {
    setEditingModuleId(module.id);
    setModuleForm({
      title: module.title || "",
      description: module.description || "",
      estimatedDuration: module.estimatedDuration ? String(module.estimatedDuration) : "",
    });
    setAddingModule(true);
  }

  async function submitModule(event) {
    event.preventDefault();
    if (!moduleForm.title.trim()) {
      setModuleError("Module title is required.");
      return;
    }
    setSavingModule(true);
    setModuleError("");
    try {
      const payload = {
        title: moduleForm.title.trim(),
        description: moduleForm.description.trim(),
        estimatedDuration: Number(moduleForm.estimatedDuration) || 0,
      };
      if (editingModuleId) await updateModule(courseId, editingModuleId, payload);
      else await createModule(courseId, payload);
      resetModuleForm();
    } catch (error) {
      setModuleError(error.message || "Unable to save module.");
    } finally {
      setSavingModule(false);
    }
  }

  return (
    <Panel
      title="Modules"
      action={
        canEdit && (
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={() => (addingModule ? resetModuleForm() : setAddingModule(true))}
            className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white"
          >
            {addingModule ? "Cancel" : "+ Add Module"}
          </motion.button>
        )
      }
    >
      <AnimatePresence initial={false}>
      {canEdit && addingModule && (
        <motion.form
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25, ease: MODULES_EASE }}
          onSubmit={submitModule}
          className="mb-5 grid gap-3 overflow-hidden rounded-2xl border border-border-subtle bg-page p-4 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold text-muted sm:col-span-2">
            Module title
            <input
              value={moduleForm.title}
              onChange={(event) => setModuleForm((current) => ({ ...current, title: event.target.value }))}
              onKeyDown={stopEnterSubmit}
              className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
              placeholder="e.g. Modern JavaScript"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted sm:col-span-2">
            Description
            <textarea
              value={moduleForm.description}
              onChange={(event) => setModuleForm((current) => ({ ...current, description: event.target.value }))}
              rows={2}
              className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Estimated duration (minutes)
            <input
              type="number"
              min="0"
              value={moduleForm.estimatedDuration}
              onChange={(event) => setModuleForm((current) => ({ ...current, estimatedDuration: event.target.value }))}
              onKeyDown={stopEnterSubmit}
              className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
            />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <motion.button whileHover={{ scale: savingModule ? 1 : 1.03 }} whileTap={{ scale: savingModule ? 1 : 0.97 }} type="submit" disabled={savingModule} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
              {savingModule ? "Saving..." : editingModuleId ? "Save changes" : "Create module"}
            </motion.button>
            {moduleError && <p className="text-xs text-primary">{moduleError}</p>}
          </div>
        </motion.form>
      )}
      </AnimatePresence>

      {modules.length ? (
        <motion.div className="space-y-3" initial="hidden" animate="show" variants={modulesStagger}>
          {modules.map((module, index) => (
            <motion.div key={module.id} variants={moduleCardMotion}>
              <ModuleCard
                courseId={courseId}
                module={module}
                canEdit={canEdit}
                isFirst={index === 0}
                isLast={index === modules.length - 1}
                onEdit={() => startEditModule(module)}
                onDelete={() => {
                  if (window.confirm(`Delete "${module.title}" and all its lessons? This cannot be undone.`)) deleteModule(courseId, module.id);
                }}
                onTogglePublish={() => updateModule(courseId, module.id, { status: module.status === "Published" ? "Draft" : "Published" })}
                onMoveUp={() => swapModuleOrder(courseId, modules[index], modules[index - 1])}
                onMoveDown={() => swapModuleOrder(courseId, modules[index], modules[index + 1])}
              />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <Empty>{canEdit ? 'No modules yet. Click "+ Add Module" to create the first one.' : "No modules published yet."}</Empty>
      )}
    </Panel>
  );
}

function ModuleCard({ courseId, module, canEdit, isFirst, isLast, onEdit, onDelete, onTogglePublish, onMoveUp, onMoveDown }) {
  const [expanded, setExpanded] = useState(false);
  const [lessons, setLessons] = useState([]);
  const [addingLesson, setAddingLesson] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState("");
  const [previewLesson, setPreviewLesson] = useState(null);

  useEffect(() => {
    if (!expanded) return undefined;
    return subscribeLessons(courseId, module.id, setLessons, () => {});
  }, [courseId, module.id, expanded]);

  return (
    <motion.div
      className="overflow-hidden rounded-2xl border border-border-subtle bg-card"
      whileHover={{ y: -2, boxShadow: "0 12px 24px -14px rgba(15,23,42,0.16)" }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <button type="button" onClick={() => setExpanded((current) => !current)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.2, ease: MODULES_EASE }} className="shrink-0 text-subtle">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </motion.span>
          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${module.status === "Published" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
            {module.status}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold text-ink">{module.title}</span>
            <span className="text-xs text-muted">{module.estimatedDuration ? `${module.estimatedDuration} min` : "No duration set"}</span>
          </span>
        </button>
        {canEdit && (
          <div className="flex shrink-0 items-center gap-1">
            <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={onMoveUp} disabled={isFirst} title="Move up" className="rounded-lg p-1.5 text-muted hover:bg-page disabled:opacity-30">
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={onMoveDown} disabled={isLast} title="Move down" className="rounded-lg p-1.5 text-muted hover:bg-page disabled:opacity-30">
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            </motion.button>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} type="button" onClick={onTogglePublish} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-page">
              {module.status === "Published" ? "Unpublish" : "Publish"}
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={onEdit} title="Edit" className="rounded-lg p-1.5 text-muted hover:bg-page">
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={onDelete} title="Delete" className="rounded-lg p-1.5 text-muted hover:bg-page hover:text-primary">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </motion.button>
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
      {expanded && (
        <motion.div variants={expandCollapse} initial="hidden" animate="show" exit="exit" className="border-t border-border-subtle p-4">
          {canEdit && (
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              type="button"
              onClick={() => {
                if (addingLesson) {
                  setAddingLesson(false);
                  setEditingLessonId("");
                } else {
                  setAddingLesson(true);
                }
              }}
              className="mb-3 rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink hover:bg-page"
            >
              {addingLesson ? "Cancel" : "+ Add Lesson"}
            </motion.button>
          )}
          <AnimatePresence initial={false}>
          {canEdit && addingLesson && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: MODULES_EASE }}
              className="overflow-hidden"
            >
              <LessonForm
                courseId={courseId}
                moduleId={module.id}
                editingLessonId={editingLessonId}
                lessons={lessons}
                onDone={() => {
                  setAddingLesson(false);
                  setEditingLessonId("");
                }}
              />
            </motion.div>
          )}
          </AnimatePresence>
          {lessons.length ? (
            <motion.div className="space-y-2" initial="hidden" animate="show" variants={modulesStagger}>
              {lessons.map((lesson, index) => (
                <motion.div key={lesson.id} variants={lessonRowMotion}>
                  <LessonRow
                    lesson={lesson}
                    canEdit={canEdit}
                    isFirst={index === 0}
                    isLast={index === lessons.length - 1}
                    onPreview={() => setPreviewLesson(lesson)}
                    onEdit={() => {
                      setEditingLessonId(lesson.id);
                      setAddingLesson(true);
                    }}
                    onDelete={() => {
                      if (window.confirm(`Delete "${lesson.title}"?`)) deleteLesson(courseId, module.id, lesson.id);
                    }}
                    onTogglePublish={() => updateLesson(courseId, module.id, lesson.id, { status: lesson.status === "Published" ? "Draft" : "Published" })}
                    onMoveUp={() => swapLessonOrder(courseId, module.id, lessons[index], lessons[index - 1])}
                    onMoveDown={() => swapLessonOrder(courseId, module.id, lessons[index], lessons[index + 1])}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <p className="text-xs text-muted">No lessons yet.</p>
          )}
          {previewLesson && (
            <div className="mt-4 border-t border-border-subtle pt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-subtle">Preview — {previewLesson.title}</p>
                <button type="button" onClick={() => setPreviewLesson(null)} className="text-xs font-bold text-muted hover:text-ink">
                  Close ×
                </button>
              </div>
              <LessonContentViewer courseId={courseId} moduleId={module.id} lesson={previewLesson} />
            </div>
          )}
        </motion.div>
      )}
      </AnimatePresence>
    </motion.div>
  );
}

function LessonRow({ lesson, canEdit, isFirst, isLast, onEdit, onDelete, onTogglePublish, onMoveUp, onMoveDown, onPreview }) {
  const Icon = CONTENT_ICON[lesson.contentType] || FileText;
  return (
    <motion.div
      whileHover={{ x: 2 }}
      transition={{ duration: 0.15 }}
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-card px-3 py-2.5"
    >
      <button type="button" onClick={onPreview} className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-primary">
        <Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
        <span className="min-w-0 truncate text-sm font-semibold text-ink">{lesson.title}</span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${lesson.status === "Published" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
          {lesson.status}
        </span>
      </button>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={onMoveUp} disabled={isFirst} className="rounded-lg p-1 text-muted hover:bg-page disabled:opacity-30">
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={onMoveDown} disabled={isLast} className="rounded-lg p-1 text-muted hover:bg-page disabled:opacity-30">
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </motion.button>
          <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} type="button" onClick={onTogglePublish} className="rounded-lg border border-border-subtle px-2 py-1 text-[10px] font-bold text-ink hover:bg-page">
            {lesson.status === "Published" ? "Unpublish" : "Publish"}
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={onEdit} className="rounded-lg p-1 text-muted hover:bg-page">
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </motion.button>
          <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={onDelete} className="rounded-lg p-1 text-muted hover:bg-page hover:text-primary">
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}

function LessonForm({ courseId, moduleId, editingLessonId, lessons, onDone }) {
  const editing = lessons.find((item) => item.id === editingLessonId) || null;
  const [form, setForm] = useState(() => ({
    title: editing?.title || "",
    description: editing?.description || "",
    contentType: editing?.contentType || "video",
    contentUrl: editing?.contentUrl || "",
    textBody: editing?.textBody || "",
    duration: editing?.duration ? String(editing.duration) : "",
    status: editing?.status || "Draft",
  }));
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const showUrlField = form.contentType === "video" || form.contentType === "link";
  const showFileField =
    form.contentType === "pdf" || form.contentType === "document" || (form.contentType === "video" && !form.contentUrl.trim());

  async function submit(event) {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Lesson title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        contentType: form.contentType,
        contentUrl: showUrlField ? form.contentUrl.trim() || null : null,
        textBody: form.contentType === "text" ? form.textBody : "",
        duration: Number(form.duration) || 0,
        status: form.status,
      };
      let lessonId = editingLessonId;
      if (editingLessonId) await updateLesson(courseId, moduleId, editingLessonId, payload);
      else lessonId = await createLesson(courseId, moduleId, payload);

      if (file && (form.contentType === "video" || form.contentType === "pdf" || form.contentType === "document")) {
        await uploadLessonContent(courseId, moduleId, lessonId, file);
      }
      onDone();
    } catch (err) {
      setError(err.message || "Unable to save lesson.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-4 grid gap-3 rounded-2xl border border-border-subtle bg-card p-4 sm:grid-cols-2">
      <label className="grid gap-1 text-xs font-bold text-muted sm:col-span-2">
        Lesson title
        <input
          value={form.title}
          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
          onKeyDown={stopEnterSubmit}
          className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
        />
      </label>
      <label className="grid gap-1 text-xs font-bold text-muted sm:col-span-2">
        Description
        <textarea
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          rows={2}
          className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
        />
      </label>
      <label className="grid gap-1 text-xs font-bold text-muted">
        Content type
        <select
          value={form.contentType}
          onChange={(event) => setForm((current) => ({ ...current, contentType: event.target.value }))}
          className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
        >
          {CONTENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-bold text-muted">
        Duration (minutes)
        <input
          type="number"
          min="0"
          value={form.duration}
          onChange={(event) => setForm((current) => ({ ...current, duration: event.target.value }))}
          onKeyDown={stopEnterSubmit}
          className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
        />
      </label>

      {showUrlField && (
        <label className="grid gap-1 text-xs font-bold text-muted sm:col-span-2">
          {form.contentType === "video" ? "YouTube or Google Drive URL (leave blank to upload a video file instead)" : "External resource URL"}
          <input
            value={form.contentUrl}
            onChange={(event) => setForm((current) => ({ ...current, contentUrl: event.target.value }))}
            onKeyDown={stopEnterSubmit}
            className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
            placeholder="https://"
          />
        </label>
      )}
      {form.contentType === "text" && (
        <label className="grid gap-1 text-xs font-bold text-muted sm:col-span-2">
          Notes
          <textarea
            value={form.textBody}
            onChange={(event) => setForm((current) => ({ ...current, textBody: event.target.value }))}
            rows={4}
            className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
          />
        </label>
      )}
      {showFileField && (
        <label className="grid gap-1 text-xs font-bold text-muted sm:col-span-2">
          {form.contentType === "video" ? "Or upload a video file (max 100MB)" : "Upload file (max 25MB)"}
          <input
            type="file"
            accept={form.contentType === "video" ? "video/*" : ".pdf,.doc,.docx,.ppt,.pptx"}
            onChange={(event) => setFile(event.target.files?.[0] || null)}
            className="text-xs"
          />
          {editing?.fileName && !file && <span className="text-[11px] text-muted">Current file: {editing.fileName}</span>}
        </label>
      )}
      <label className="grid gap-1 text-xs font-bold text-muted">
        Status
        <select
          value={form.status}
          onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
          className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm"
        >
          <option value="Draft">Draft</option>
          <option value="Published">Published</option>
        </select>
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
          {saving ? "Saving..." : editingLessonId ? "Save changes" : "Create lesson"}
        </button>
        {error && <p className="text-xs text-primary">{error}</p>}
      </div>
    </form>
  );
}
