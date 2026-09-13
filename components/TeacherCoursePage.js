"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TeacherGate from "./TeacherGate";
import { useAuth } from "../lib/auth-context";
import {
  listClassEnrollments,
  saveAttendance,
  subscribeTeacherCourse,
  subscribeTeacherCourseAttendance,
  subscribeTeacherCourseClasses,
  subscribeTeacherStudents,
} from "../lib/teacher-data";
import { attendancePercent } from "../lib/attendance";

function Empty({ children }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-subtle bg-card p-8 text-center text-sm text-muted">
      {children}
    </div>
  );
}

export default function TeacherCoursePage() {
  const { user } = useAuth();
  const { courseId } = useParams();
  const [course, setCourse] = useState(null);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [enrolledIds, setEnrolledIds] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [statuses, setStatuses] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user?.uid || !courseId) return undefined;
    const fail = (firebaseError) => {
      console.error("[teacher-course] load failed", firebaseError);
      setError(firebaseError?.message || "Unable to load course data.");
      setLoading(false);
    };
    const unsubscribers = [
      subscribeTeacherCourse(user.uid, courseId, setCourse, fail),
      subscribeTeacherCourseClasses(
        user.uid,
        courseId,
        (items) => {
          setClasses(items);
          setSelectedClassId((current) => current || items[0]?.id || "");
          setLoading(false);
        },
        fail,
      ),
      subscribeTeacherStudents(user.uid, (items) => setStudents(items), fail),
      subscribeTeacherCourseAttendance(user.uid, courseId, setAttendance, fail),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [courseId, user?.uid]);

  useEffect(() => {
    let cancelled = false;
    async function loadEnrollments() {
      if (!classes.length) {
        setEnrolledIds([]);
        return;
      }
      try {
        const enrollmentGroups = await Promise.all(
          classes.map((item) => listClassEnrollments(item.id)),
        );
        if (!cancelled)
          setEnrolledIds([
            ...new Set(
              enrollmentGroups
                .flat()
                .filter(
                  (item) =>
                    item.courseId === courseId && item.status !== "withdrawn",
                )
                .map((item) => item.studentId),
            ),
          ]);
      } catch (loadError) {
        if (!cancelled) {
          console.error("[teacher-course] enrollment load failed", loadError);
          setError(loadError.message || "Unable to load course enrollments.");
        }
      }
    }
    loadEnrollments();
    return () => {
      cancelled = true;
    };
  }, [classes, courseId]);

  const enrolledStudents = useMemo(
    () => students.filter((student) => enrolledIds.includes(student.id)),
    [enrolledIds, students],
  );
  const selectedClass = classes.find((item) => item.id === selectedClassId);
  const selectedDate =
    selectedClass?.date ||
    selectedClass?.startsAt?.toDate?.()?.toISOString?.().slice(0, 10) ||
    "";

  const attendanceByStudent = useMemo(() => {
    return enrolledStudents.reduce((result, student) => {
      const records = attendance.filter(
        (item) => item.studentId === student.id,
      );
      result[student.id] = attendancePercent(records);
      return result;
    }, {});
  }, [attendance, enrolledStudents]);

  async function saveSelectedAttendance() {
    if (!selectedClassId || !selectedDate || !enrolledStudents.length) return;
    setMessage("");
    try {
      await saveAttendance(
        user.uid,
        enrolledStudents.map((student) => ({
          id: `${courseId}_${selectedClassId}_${student.id}_${selectedDate}`,
          courseId,
          classId: selectedClassId,
          studentId: student.id,
          date: selectedDate,
          status: statuses[student.id] || "present",
        })),
      );
      setMessage("Attendance saved for this course session.");
    } catch (saveError) {
      setError(saveError.message || "Unable to save attendance.");
    }
  }

  return (
    <TeacherGate>
      <main className="min-h-screen bg-page text-ink">
        <div className="mx-auto max-w-6xl p-4 md:p-8">
          <Link
            href="/teacher/training"
            className="text-xs font-semibold text-primary"
          >
            ← Back to my courses
          </Link>
          {loading ? (
            <div className="mt-6">
              <Empty>Loading course data...</Empty>
            </div>
          ) : error ? (
            <div className="mt-6">
              <Empty>{error}</Empty>
            </div>
          ) : !course ? (
            <div className="mt-6">
              <Empty>No course found</Empty>
            </div>
          ) : (
            <>
              <header className="mt-5 rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 text-ink shadow-xl md:p-8">
                <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                  Teacher course
                </p>
                <h1 className="mt-3 text-3xl font-black md:text-5xl">
                  {course.title}
                </h1>
                <p className="mt-3 max-w-2xl text-sm text-muted">
                  {course.description || "No course description available."}
                </p>
              </header>
              <nav className="my-5 flex gap-2 overflow-x-auto rounded-2xl border border-border-subtle bg-card p-2 shadow-sm">
                <a
                  href="#overview"
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white"
                >
                  Overview
                </a>
                <a
                  href="#students"
                  className="rounded-xl px-4 py-2 text-xs font-bold text-muted hover:bg-active"
                >
                  Students
                </a>
                <a
                  href="#sessions"
                  className="rounded-xl px-4 py-2 text-xs font-bold text-muted hover:bg-active"
                >
                  Classes / Sessions
                </a>
                <a
                  href="#attendance"
                  className="rounded-xl px-4 py-2 text-xs font-bold text-muted hover:bg-active"
                >
                  Attendance
                </a>
              </nav>
              <section id="overview" className="grid gap-4 md:grid-cols-3">
                <article className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                    Enrolled students
                  </span>
                  <strong className="mt-2 block text-3xl">
                    {enrolledStudents.length}
                  </strong>
                </article>
                <article className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                    Class sessions
                  </span>
                  <strong className="mt-2 block text-3xl">
                    {classes.length}
                  </strong>
                </article>
                <article className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                    Course status
                  </span>
                  <strong className="mt-2 block text-lg">
                    {course.status || "Not specified"}
                  </strong>
                </article>
              </section>
              <section
                id="students"
                className="mt-5 rounded-3xl border border-border-subtle bg-card p-5 shadow-sm"
              >
                <h2 className="font-bold">Students enrolled in this course</h2>
                {enrolledStudents.length ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {enrolledStudents.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center justify-between rounded-2xl bg-page p-4"
                      >
                        <div>
                          <b className="block text-sm">
                            {student.displayName || "Unnamed student"}
                          </b>
                          <span className="text-xs text-muted">
                            {student.email || "No contact available"}
                          </span>
                        </div>
                        <span className="text-xs font-bold text-primary">
                          {attendanceByStudent[student.id] == null
                            ? "No attendance"
                            : `${attendanceByStudent[student.id]}%`}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4">
                    <Empty>No students enrolled in this course</Empty>
                  </div>
                )}
              </section>
              <section
                id="sessions"
                className="mt-5 rounded-3xl border border-border-subtle bg-card p-5 shadow-sm"
              >
                <h2 className="font-bold">Classes / training sessions</h2>
                {classes.length ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {classes.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedClassId(item.id)}
                        className={`rounded-2xl border p-4 text-left ${selectedClassId === item.id ? "border-primary bg-active" : "border-border-subtle"}`}
                      >
                        <b className="block text-sm">
                          {item.name || "Class session"}
                        </b>
                        <span className="text-xs text-muted">
                          {item.date ||
                            item.startsAt?.toDate?.()?.toLocaleDateString?.() ||
                            "Date not set"}{" "}
                          · {item.room || "Room not set"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4">
                    <Empty>No class sessions found for this course</Empty>
                  </div>
                )}
              </section>
              <section
                id="attendance"
                className="mt-5 rounded-3xl border border-border-subtle bg-card p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-bold">Offline attendance</h2>
                    <p className="mt-1 text-xs text-muted">
                      {selectedClass
                        ? `${selectedClass.name || "Selected session"} · ${selectedDate || "Date not set"}`
                        : "Select a class session first."}
                    </p>
                  </div>
                  <button
                    disabled={!selectedClassId || !enrolledStudents.length}
                    onClick={saveSelectedAttendance}
                    className="rounded-xl bg-primary px-4 py-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Save attendance
                  </button>
                </div>
                {message && (
                  <p className="mt-3 text-xs text-success">{message}</p>
                )}
                {selectedClassId && enrolledStudents.length ? (
                  <div className="mt-5 space-y-2">
                    {enrolledStudents.map((student) => (
                      <div
                        key={student.id}
                        className="flex items-center justify-between rounded-xl bg-page p-3 text-xs"
                      >
                        <b>{student.displayName || student.email}</b>
                        <select
                          value={statuses[student.id] || "present"}
                          onChange={(event) =>
                            setStatuses({
                              ...statuses,
                              [student.id]: event.target.value,
                            })
                          }
                          className="rounded-lg border border-border-subtle bg-card px-2 py-2"
                        >
                          <option value="present">Present</option>
                          <option value="absent">Absent</option>
                          <option value="late">Late</option>
                          <option value="excused">Excused</option>
                        </select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-5">
                    <Empty>
                      {selectedClassId
                        ? "No enrolled students"
                        : "Select a class session to mark attendance"}
                    </Empty>
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </TeacherGate>
  );
}
