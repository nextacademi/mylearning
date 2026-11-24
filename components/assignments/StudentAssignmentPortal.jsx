"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, ExternalLink, FileText, Send } from "lucide-react";
import { subscribeMyEnrollments, loadClassInfo } from "../../lib/student-data";
import {
  attemptsUsed, submitAssignment, submitBlockedReason, subscribeClassAssignments, subscribeMySubmissions, todayLocal,
} from "../../lib/assignment-data";
import { assignmentNumberLabel, compareAssignments } from "../../lib/assignment-shared";
import { useToast } from "../ui/Toast";

// Student / Volunteer "Assignment" tab — the Submit Assignment portal the
// Assignment QR code (tinyurl.com/NextAssignment → /assignment) opens.
// Pick course → batch → assignment, describe the work, add a link, submit.
// Writes the same submissions/{assignmentId}_{studentId} document as
// Model Test → Assignment (lib/assignment-data.js), so staff see it in the
// Assignment Portal straight away; firestore.rules keep a student to their
// own submission and never let them set a score.

const LABEL = "grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted";
const FIELD = "w-full rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-ink outline-none focus:ring-2 focus:ring-primary disabled:opacity-60";

const formatDay = (value) => {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

function statusOf(assignment, submission) {
  if (submission?.score != null) return { label: `Graded ${submission.score}/${assignment.maxScore}`, cls: "bg-success-soft text-success", done: true };
  if (submission) return { label: submission.late ? "Submitted late" : "Submitted", cls: "bg-success-soft text-success", done: true };
  if (assignment.expiresAt && todayLocal() > assignment.expiresAt) return { label: "Closed", cls: "bg-page text-muted" };
  if (assignment.dueDate && todayLocal() > assignment.dueDate) return { label: "Overdue", cls: "bg-active text-primary" };
  return { label: "To do", cls: "bg-warning-soft text-warning" };
}

function Step({ number, title, children }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-black text-white">{number}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-bold text-ink">{title}</p>
        {children}
      </div>
    </div>
  );
}

// Description + link for one assignment. Keyed by the assignment, so
// switching assignment starts from that one's own previous answer.
function SubmissionForm({ assignment, existing, onSubmit, onSubmitted }) {
  const [answer, setAnswer] = useState(existing?.answer || "");
  const [link, setLink] = useState(existing?.link || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const blocked = submitBlockedReason(assignment, existing);
  const triesLeft = (assignment.maxAttempts || 1) - attemptsUsed(existing);

  async function submit(event) {
    event.preventDefault();
    if (!answer.trim()) {
      setError("Write a short description of your work.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSubmit(assignment, { answer, link }, existing);
      toast.success(existing ? "Submission updated." : "Assignment submitted.");
      onSubmitted();
    } catch (err) {
      setError(err.message || "Unable to submit. Please try again.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Step number={4} title="Describe your work">
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={6}
          maxLength={10000}
          required
          disabled={Boolean(blocked)}
          placeholder="What did you do? Anything your trainer should know (steps, problems, what you learned)…"
          className={FIELD}
        />
        <p className="text-right text-[11px] text-subtle">{answer.length}/10000</p>
      </Step>
      <Step number={5} title="Link to your work (optional)">
        <input
          type="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={Boolean(blocked)}
          placeholder="https://drive.google.com/…"
          className={FIELD}
        />
        <p className="text-[11px] text-subtle">Google Drive, Docs, OneDrive, GitHub… Share the link so your trainer can open it.</p>
      </Step>
      {error && <p className="rounded-xl bg-active px-3 py-2 text-sm text-primary">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border-subtle pt-4">
        {blocked ? (
          <span className="text-sm font-bold text-muted">{blocked}</span>
        ) : (
          (assignment.maxAttempts || 1) > 1 && <span className="text-xs text-muted">{triesLeft} {triesLeft === 1 ? "try" : "tries"} left</span>
        )}
        <button type="submit" disabled={saving || Boolean(blocked)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-primary-hover disabled:opacity-40">
          <Send className="h-4 w-4" aria-hidden="true" /> {saving ? "Submitting…" : existing ? "Update submission" : "Submit assignment"}
        </button>
      </div>
    </form>
  );
}

// Live data for the signed-in student; the page itself is
// AssignmentSubmitView below.
export default function StudentAssignmentPortal({ uid, name }) {
  const [enrollments, setEnrollments] = useState(null);
  const [classNames, setClassNames] = useState(new Map());
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => subscribeMyEnrollments(uid, setEnrollments, () => { setEnrollments([]); setError("Unable to load your trainings."); }), [uid]);
  const classKey = [...new Set((enrollments || []).map((e) => e.classId).filter(Boolean))].sort().join(",");
  useEffect(() => subscribeClassAssignments(classKey ? classKey.split(",") : [], uid, setAssignments, () => setError("Unable to load your assignments.")), [classKey, uid]);
  useEffect(() => subscribeMySubmissions(uid, setSubmissions, () => {}), [uid]);
  useEffect(() => {
    if (!classKey) return undefined;
    let cancelled = false;
    Promise.all(classKey.split(",").map((id) => loadClassInfo(id).then((info) => [id, info?.name || ""]).catch(() => [id, ""])))
      .then((entries) => { if (!cancelled) setClassNames(new Map(entries)); });
    return () => { cancelled = true; };
  }, [classKey]);

  return (
    <AssignmentSubmitView
      name={name}
      enrollments={enrollments}
      classNames={classNames}
      assignments={assignments}
      submissions={submissions}
      error={error}
      onSubmit={(assignment, form, existing) => submitAssignment(assignment, uid, form, existing)}
    />
  );
}

export function AssignmentSubmitView({ name, enrollments, classNames, assignments, submissions, error, onSubmit }) {
  const [courseId, setCourseId] = useState("");
  const [classId, setClassId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [done, setDone] = useState(null);

  const mine = useMemo(() => new Map(submissions.map((s) => [s.assignmentId, s])), [submissions]);
  const courses = useMemo(() => {
    const map = new Map();
    (enrollments || []).forEach((e) => {
      const entry = map.get(e.courseId) || { courseId: e.courseId, title: e.courseTitle, code: e.courseCode, classIds: [] };
      if (e.classId && !entry.classIds.includes(e.classId)) entry.classIds.push(e.classId);
      map.set(e.courseId, entry);
    });
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
  }, [enrollments]);
  // Each training's assignments numbered in order (Assignment 01, 02, …).
  const numbered = useMemo(() => {
    const byCourse = new Map();
    assignments.forEach((a) => byCourse.set(a.courseId, [...(byCourse.get(a.courseId) || []), a]));
    return new Map([...byCourse.entries()].map(([id, list]) => [id, [...list].sort(compareAssignments).map((a, index) => ({ ...a, number: index + 1 }))]));
  }, [assignments]);

  // One course / one batch → picked for the student.
  const course = courses.find((c) => c.courseId === courseId) || (courses.length === 1 ? courses[0] : null);
  const chosenClass = course ? (course.classIds.includes(classId) ? classId : course.classIds.length === 1 ? course.classIds[0] : "") : "";
  const options = course && chosenClass ? (numbered.get(course.courseId) || []).filter((a) => a.classId === chosenClass) : [];
  const assignment = options.find((a) => a.id === assignmentId) || null;
  const existing = assignment ? mine.get(assignment.id) : null;

  if (enrollments === null) {
    return <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">{[0, 1].map((i) => <div key={i} className="h-72 animate-pulse rounded-2xl bg-card" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 shadow-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Assignment portal</p>
          <h2 className="mt-1 text-3xl font-black text-ink">Submit Assignment</h2>
          <p className="mt-1 text-sm text-muted">Pick your course, batch and assignment, describe your work and submit.</p>
        </div>
        <span className="rounded-xl border border-[#f3aaaa] bg-white px-4 py-2 text-sm text-slate-600">Submitting as <b className="text-slate-900">{name}</b></span>
      </section>

      {error && <p className="rounded-2xl bg-active p-4 text-sm text-primary">{error}</p>}

      {!courses.length ? (
        <div className="rounded-3xl border border-dashed border-border-subtle bg-card py-16 text-center">
          <p className="font-bold text-ink">You&apos;re not in a training yet.</p>
          <p className="mt-1 text-sm text-muted">Once you&apos;re enrolled in a training, its assignments appear here.</p>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-2xl border border-border-subtle bg-card p-6 shadow-sm">
            {done ? (
              <div className="py-8 text-center">
                <CheckCircle2 className="mx-auto h-14 w-14 text-success" aria-hidden="true" />
                <h3 className="mt-3 text-2xl font-black text-ink">Assignment submitted</h3>
                <p className="mt-1 text-sm text-muted">{assignmentNumberLabel(done.number)}: {done.title} · {done.course}</p>
                <p className="mt-1 text-xs text-subtle">{done.at}</p>
                <button type="button" onClick={() => { setDone(null); setAssignmentId(""); }} className="mt-6 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-hover">Submit another</button>
              </div>
            ) : (
              <div className="space-y-5">
                <Step number={1} title="Course">
                  <select aria-label="Course" value={course?.courseId || ""} onChange={(e) => { setCourseId(e.target.value); setClassId(""); setAssignmentId(""); }} className={FIELD}>
                    {!course && <option value="">Choose your course</option>}
                    {courses.map((c) => <option key={c.courseId} value={c.courseId}>{c.title}{c.code && c.code !== c.courseId ? ` (${c.code})` : ""}</option>)}
                  </select>
                </Step>
                <Step number={2} title="Batch">
                  <select aria-label="Batch" value={chosenClass} onChange={(e) => { setClassId(e.target.value); setAssignmentId(""); }} disabled={!course || course.classIds.length < 2} className={FIELD}>
                    {!chosenClass && <option value="">{course ? (course.classIds.length ? "Choose your batch" : "No batch found") : "Choose a course first"}</option>}
                    {(course?.classIds || []).map((id) => <option key={id} value={id}>{classNames.get(id) || course.title}</option>)}
                  </select>
                </Step>
                <Step number={3} title="Assignment">
                  <select aria-label="Assignment" value={assignment?.id || ""} onChange={(e) => setAssignmentId(e.target.value)} disabled={!options.length} className={FIELD}>
                    <option value="">{!chosenClass ? "Choose a batch first" : options.length ? "Choose the assignment" : "No assignment published yet"}</option>
                    {options.map((a) => (
                      <option key={a.id} value={a.id}>{`${assignmentNumberLabel(a.number)} — ${a.title}${mine.get(a.id) ? " ✓" : ""}`}</option>
                    ))}
                  </select>
                  {assignment && (
                    <div className="space-y-2 rounded-xl bg-page p-4 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <b className="text-ink">{assignment.title}</b>
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusOf(assignment, existing).cls}`}>{statusOf(assignment, existing).label}</span>
                      </div>
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                        <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />{assignment.dueDate ? `Due ${formatDay(assignment.dueDate)}` : "No due date"}</span>
                        <span>{assignment.maxScore} points</span>
                        {assignment.expiresAt && <span>Closes {formatDay(assignment.expiresAt)}</span>}
                      </p>
                      {assignment.instructions && <p className="whitespace-pre-wrap text-xs text-ink">{assignment.instructions}</p>}
                      {assignment.resourceUrl && (
                        <a href={assignment.resourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-info hover:underline">
                          <FileText className="h-3.5 w-3.5" aria-hidden="true" /> Open assignment resource
                        </a>
                      )}
                      {existing?.feedback && <p className="rounded-lg bg-card p-2 text-xs text-ink"><b>Feedback:</b> {existing.feedback}</p>}
                    </div>
                  )}
                </Step>
                {assignment && (
                  <SubmissionForm
                    key={assignment.id}
                    assignment={assignment}
                    existing={existing}
                    onSubmit={onSubmit}
                    onSubmitted={() => setDone({
                      number: assignment.number,
                      title: assignment.title,
                      course: course.title,
                      at: new Date().toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }),
                    })}
                  />
                )}
              </div>
            )}
          </section>

          <aside className="space-y-4">
            {courses.map((c) => {
              const list = numbered.get(c.courseId) || [];
              const handedIn = list.filter((a) => mine.get(a.id)).length;
              return (
                <section key={c.courseId} className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-primary">My assignments</p>
                      <h3 className="truncate font-bold text-ink">{c.title}</h3>
                    </div>
                    <span className="shrink-0 rounded-full bg-page px-2.5 py-1 text-xs font-bold text-ink">{handedIn}/{list.length}</span>
                  </div>
                  {!list.length ? (
                    <p className="text-sm text-muted">No assignment published yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {list.map((a) => {
                        const status = statusOf(a, mine.get(a.id));
                        return (
                          <li key={a.id}>
                            <button
                              type="button"
                              onClick={() => { setDone(null); setCourseId(c.courseId); setClassId(a.classId); setAssignmentId(a.id); }}
                              className="flex w-full items-center justify-between gap-2 rounded-xl border border-border-subtle px-3 py-2 text-left hover:bg-page"
                            >
                              <span className="min-w-0">
                                <b className="block text-xs text-ink">{assignmentNumberLabel(a.number)}</b>
                                <span className="block truncate text-xs text-muted">{a.title}</span>
                              </span>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>{status.label}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {list.length > 0 && (
                    <p className="mt-3 text-[11px] text-subtle">
                      <ExternalLink className="mr-1 inline h-3 w-3" aria-hidden="true" />Tap an assignment to open it, or to update what you sent.
                    </p>
                  )}
                </section>
              );
            })}
          </aside>
        </div>
      )}
    </div>
  );
}
