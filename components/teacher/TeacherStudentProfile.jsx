"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import TeacherGate from "../TeacherGate";
import { useAuth } from "../../lib/auth-context";
import {
  listClassEnrollments,
  subscribeTeacherClasses,
  subscribeTeacherCourses,
  subscribeTeacherStudent,
  subscribeTeacherStudentAchievements,
  subscribeTeacherStudentAttendance,
  subscribeTeacherStudentCertificates,
} from "../../lib/teacher-data";
import IdCardPrint from "./IdCardPrint";

function Empty({ children }) {
  return (
    <div className="rounded-2xl border border-dashed border-border-subtle bg-card p-8 text-center text-sm text-muted">
      {children}
    </div>
  );
}
function Panel({ title, children }) {
  return (
    <section className="mt-5 rounded-3xl border border-border-subtle bg-card p-5 shadow-sm">
      <h2 className="mb-4 font-bold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default function TeacherStudentProfile() {
  const { user } = useAuth();
  const { studentId } = useParams();
  const [student, setStudent] = useState(null);
  const [classes, setClasses] = useState([]);
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [achievements, setAchievements] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showIdCard, setShowIdCard] = useState(false);

  useEffect(() => {
    if (!user?.uid || !studentId) return undefined;
    const fail = (err) => {
      console.error("[teacher-student-profile] load failed", err);
      setError(err?.message || "Unable to load this student.");
      setLoading(false);
    };
    const unsubscribers = [
      subscribeTeacherStudent(user.uid, studentId, (item) => {
        setStudent(item);
        setLoading(false);
      }, fail),
      subscribeTeacherClasses(user.uid, setClasses, fail),
      subscribeTeacherCourses(user.uid, setCourses, fail),
      subscribeTeacherStudentAttendance(user.uid, studentId, setAttendance, fail),
      subscribeTeacherStudentAchievements(user.uid, studentId, setAchievements, fail),
      subscribeTeacherStudentCertificates(user.uid, studentId, setCertificates, fail),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [studentId, user?.uid]);

  useEffect(() => {
    let cancelled = false;
    async function loadEnrollments() {
      if (!classes.length) {
        setEnrollments([]);
        return;
      }
      const groups = await Promise.all(classes.map((item) => listClassEnrollments(item.id)));
      if (!cancelled) {
        setEnrollments(
          groups.flat().filter((item) => item.studentId === studentId && item.status !== "withdrawn"),
        );
      }
    }
    loadEnrollments();
    return () => {
      cancelled = true;
    };
  }, [classes, studentId]);

  const courseTitle = (courseId) => courses.find((item) => item.id === courseId)?.title || courseId;
  const attendanceRate = useMemo(() => {
    if (!attendance.length) return null;
    const present = attendance.filter((item) => ["present", "late"].includes(item.status)).length;
    return Math.round((present / attendance.length) * 100);
  }, [attendance]);

  return (
    <TeacherGate>
      <main className="min-h-screen bg-page text-ink">
        <div className="mx-auto max-w-5xl p-4 md:p-8">
          <Link href="/teacher/students" className="text-xs font-semibold text-primary">
            ← Back to students
          </Link>
          {loading ? (
            <div className="mt-6">
              <Empty>Loading student profile...</Empty>
            </div>
          ) : error ? (
            <div className="mt-6">
              <Empty>{error}</Empty>
            </div>
          ) : !student ? (
            <div className="mt-6">
              <Empty>Student not found</Empty>
            </div>
          ) : (
            <>
              <header className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-4 text-ink shadow-sm md:p-5">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-primary">
                    {student.userId || "—"} · Student profile
                  </p>
                  <h1 className="mt-1 text-lg font-black md:text-xl">
                    {student.displayName || "Unnamed student"}
                  </h1>
                  <p className="mt-1 text-xs text-muted">{student.email}</p>
                </div>
                <button
                  onClick={() => setShowIdCard((current) => !current)}
                  className="rounded-xl border border-border-subtle bg-card px-4 py-2 text-xs font-bold text-primary"
                >
                  {showIdCard ? "Hide ID card" : "Print ID card"}
                </button>
              </header>

              {showIdCard && (
                <Panel title="Student ID card">
                  <IdCardPrint
                    mode="student"
                    studentId={studentId}
                    roleLabel="Student"
                    fallbackName={student.displayName}
                    fallbackEmail={student.email}
                  />
                </Panel>
              )}

              <section className="mt-5 grid gap-4 md:grid-cols-3">
                <article className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">Enrollments</span>
                  <strong className="mt-2 block text-3xl">{enrollments.length}</strong>
                </article>
                <article className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">Attendance rate</span>
                  <strong className="mt-2 block text-3xl">{attendanceRate == null ? "—" : `${attendanceRate}%`}</strong>
                </article>
                <article className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">Status</span>
                  <strong className="mt-2 block text-lg">{student.active === false ? "Inactive" : "Active"}</strong>
                </article>
              </section>

              <Panel title="Training enrollment & progress">
                {enrollments.length ? (
                  <div className="space-y-2">
                    {enrollments.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-xl bg-page p-3 text-xs">
                        <b>{courseTitle(item.courseId)}</b>
                        <span className="text-muted">{item.status || "enrolled"}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty>No training enrollments found</Empty>
                )}
              </Panel>

              <Panel title="Attendance history">
                {attendance.length ? (
                  <div className="space-y-2">
                    {attendance
                      .slice()
                      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
                      .map((item) => (
                        <div key={item.id} className="flex items-center justify-between rounded-xl bg-page p-3 text-xs">
                          <span>{item.date}</span>
                          <b className={item.status === "present" ? "text-success" : item.status === "late" ? "text-warning" : "text-primary"}>
                            {item.status}
                          </b>
                        </div>
                      ))}
                  </div>
                ) : (
                  <Empty>No attendance recorded yet</Empty>
                )}
              </Panel>

              <Panel title="Achievements & certificates">
                {achievements.length || certificates.length ? (
                  <div className="space-y-2">
                    {achievements.map((item) => (
                      <div key={item.id} className="rounded-xl bg-page p-3 text-xs">
                        <b>{item.title}</b> <span className="text-muted">· Achievement</span>
                      </div>
                    ))}
                    {certificates.map((item) => (
                      <div key={item.id} className="rounded-xl bg-page p-3 text-xs">
                        <b>{item.title}</b> <span className="text-muted">· Certificate</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty>No achievements or certificates yet</Empty>
                )}
              </Panel>
            </>
          )}
        </div>
      </main>
    </TeacherGate>
  );
}
