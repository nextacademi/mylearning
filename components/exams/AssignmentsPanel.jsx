"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ExternalLink, FileText, LayoutGrid, List, Pencil, Plus, Trash2, Users } from "lucide-react";
import {
  createAssignment, deleteAssignment, gradeSubmission, loadAssignableClasses, setAssignmentStatus,
  subscribeAllAssignments, subscribeAssignmentSubmissions, subscribeClassAssignments, subscribeMySubmissions,
  subscribeTeacherAssignmentList, submitAssignment, updateAssignment,
} from "../../lib/assignment-data";
import { loadUsersByIds } from "../../lib/training-detail";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";

// Model Test → "Assignment" tab (the other tab is the existing exams).
// Staff (Admin/Director/Teacher) create, publish and grade; students see
// published assignments for their classes and submit an answer and/or a
// link. Data: lib/assignment-data.js.

const LABEL = "grid gap-1 text-xs font-bold text-muted";
const FIELD = "rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary";

// Shared Grid | List switch — used by both Model Test tabs, staff and student.
export function LayoutToggle({ value, onChange }) {
  return (
    <div className="flex rounded-xl border border-border-subtle bg-card p-1 shadow-sm" role="group" aria-label="Layout">
      {[["grid", LayoutGrid, "Grid"], ["list", List, "List"]].map(([key, Icon, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${value === key ? "bg-primary text-white" : "text-muted hover:bg-page"}`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
        </button>
      ))}
    </div>
  );
}

function Dialog({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl ${wide ? "max-w-3xl" : "max-w-lg"}`}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="text-xl text-muted" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function dueLabel(dueDate) {
  if (!dueDate) return "No due date";
  const [y, m, d] = dueDate.split("-").map(Number);
  return `Due ${new Date(y, m - 1, d).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`;
}
const isOverdue = (dueDate) => {
  if (!dueDate) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return dueDate < today;
};

function StatusPill({ status }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${status === "published" ? "bg-success-soft text-success" : "bg-page text-muted"}`}>
      {status || "draft"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------
function AssignmentForm({ initial, courses, teacherId, isManager, saving, error, onCancel, onSubmit }) {
  const [form, setForm] = useState(initial);
  const [classes, setClasses] = useState([]);
  const isEdit = Boolean(initial.id);

  useEffect(() => {
    if (isEdit || !form.courseId) return undefined;
    let cancelled = false;
    loadAssignableClasses(form.courseId, isManager ? "" : teacherId)
      .then((list) => {
        if (cancelled) return;
        setClasses(list);
        setForm((current) => (list.some((c) => c.id === current.classId) ? current : { ...current, classId: list[0]?.id || "" }));
      })
      .catch(() => { if (!cancelled) setClasses([]); });
    return () => { cancelled = true; };
  }, [form.courseId, isEdit, isManager, teacherId]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  function submit(event) {
    event.preventDefault();
    const course = courses.find((c) => c.id === form.courseId);
    const classItem = classes.find((c) => c.id === form.classId);
    onSubmit({
      ...form,
      teacherId: isEdit
        ? form.teacherId
        : isManager
          ? course?.primaryTeacherId || classItem?.teacherIds?.[0] || ""
          : teacherId,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Training
          <select value={form.courseId} onChange={(e) => setForm((c) => ({ ...c, courseId: e.target.value, classId: "" }))} required disabled={isEdit} className={FIELD}>
            <option value="">Select a training</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        <label className={LABEL}>
          Class / batch
          <select value={form.classId} onChange={set("classId")} required disabled={isEdit || !form.courseId} className={FIELD}>
            {isEdit ? <option value={form.classId}>{form.className || "Current class"}</option> : !classes.length ? <option value="">{form.courseId ? "No class found" : "Select a training first"}</option> : null}
            {!isEdit && classes.map((c) => <option key={c.id} value={c.id}>{c.name || "Batch"}</option>)}
          </select>
        </label>
      </div>
      <label className={LABEL}>
        Title
        <input value={form.title} onChange={set("title")} required maxLength={160} placeholder="Week 3 — Excel formulas practice" className={FIELD} />
      </label>
      <label className={LABEL}>
        Instructions <span className="font-normal text-subtle">(optional)</span>
        <textarea value={form.instructions} onChange={set("instructions")} rows={4} maxLength={5000} className={FIELD} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Due date <span className="font-normal text-subtle">(optional)</span>
          <input type="date" value={form.dueDate} onChange={set("dueDate")} className={FIELD} />
        </label>
        <label className={LABEL}>
          Max score
          <input type="number" min="1" value={form.maxScore} onChange={set("maxScore")} required className={FIELD} />
        </label>
      </div>
      <label className={LABEL}>
        Resource link <span className="font-normal text-subtle">(optional — worksheet, Google Doc, video…)</span>
        <input type="url" value={form.resourceUrl} onChange={set("resourceUrl")} placeholder="https://…" className={FIELD} />
      </label>
      {error && <p className="rounded-xl bg-active px-3 py-2 text-sm text-primary">{error}</p>}
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted">Cancel</button>
        <button disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save assignment"}</button>
      </div>
    </form>
  );
}

function SubmissionsDialog({ assignment, teacherId, isManager, onClose }) {
  const [submissions, setSubmissions] = useState([]);
  const [students, setStudents] = useState(new Map());
  const [grading, setGrading] = useState({});
  const [savingId, setSavingId] = useState("");
  const toast = useToast();

  useEffect(
    () => subscribeAssignmentSubmissions(assignment.id, isManager ? "" : teacherId, setSubmissions, () => {}),
    [assignment.id, isManager, teacherId],
  );
  const studentKey = submissions.map((s) => s.studentId).sort().join(",");
  useEffect(() => {
    if (!studentKey) return undefined;
    let cancelled = false;
    loadUsersByIds(studentKey.split(",")).then((rows) => {
      if (!cancelled) setStudents(new Map(rows.map((row) => [row.id, row])));
    });
    return () => { cancelled = true; };
  }, [studentKey]);

  async function grade(submission) {
    const draft = grading[submission.id] || {};
    setSavingId(submission.id);
    try {
      await gradeSubmission(submission.id, {
        score: draft.score ?? submission.score,
        feedback: draft.feedback ?? submission.feedback,
      }, Number(assignment.maxScore) || 100);
      toast.success("Grade saved.");
    } catch (error) {
      toast.error(error.message || "Unable to save the grade.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <Dialog title={`Submissions — ${assignment.title}`} onClose={onClose} wide>
      {!submissions.length ? (
        <p className="py-8 text-center text-sm text-muted">No submissions yet.</p>
      ) : (
        <div className="space-y-3">
          {submissions.map((submission) => {
            const student = students.get(submission.studentId);
            const draft = grading[submission.id] || {};
            return (
              <div key={submission.id} className="space-y-2 rounded-2xl border border-border-subtle p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <b className="block text-sm text-ink">{student?.displayName || student?.email || submission.studentId}</b>
                    <span className="block text-[11px] text-muted">{[student?.email, student?.phone].filter(Boolean).join(" · ")}</span>
                  </div>
                  {submission.score != null ? (
                    <span className="rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-bold text-success">{submission.score}/{assignment.maxScore}</span>
                  ) : (
                    <span className="rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-bold text-warning">Not graded</span>
                  )}
                </div>
                {submission.answer && <p className="whitespace-pre-wrap rounded-xl bg-page p-3 text-xs text-ink">{submission.answer}</p>}
                {submission.link && (
                  <a href={submission.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-info hover:underline">
                    <ExternalLink className="h-3.5 w-3.5" /> Open submitted link
                  </a>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <label className={`${LABEL} sm:w-28`}>
                    Score
                    <input
                      type="number"
                      min="0"
                      max={assignment.maxScore}
                      value={draft.score ?? submission.score ?? ""}
                      onChange={(e) => setGrading({ ...grading, [submission.id]: { ...draft, score: e.target.value } })}
                      className={`${FIELD} py-2`}
                    />
                  </label>
                  <label className={`${LABEL} flex-1`}>
                    Feedback
                    <input
                      value={draft.feedback ?? submission.feedback ?? ""}
                      onChange={(e) => setGrading({ ...grading, [submission.id]: { ...draft, feedback: e.target.value } })}
                      maxLength={2000}
                      className={`${FIELD} py-2`}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => grade(submission)}
                    disabled={savingId === submission.id || (draft.score ?? submission.score ?? "") === ""}
                    className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {savingId === submission.id ? "Saving…" : "Save grade"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}

const blankAssignment = () => ({ courseId: "", classId: "", title: "", instructions: "", dueDate: "", maxScore: "100", resourceUrl: "" });

export function StaffAssignments({ teacherId, isManager, courses, layout, createSignal }) {
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | blank | assignment
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    const onData = (list) => { setAssignments(list); setLoading(false); };
    const onError = () => setLoading(false);
    return isManager ? subscribeAllAssignments(onData, onError) : subscribeTeacherAssignmentList(teacherId, onData, onError);
  }, [isManager, teacherId]);

  // The "Create Assignment" button lives in the parent's header; it bumps
  // createSignal to open the form here.
  const [lastSignal, setLastSignal] = useState(createSignal);
  if (createSignal !== lastSignal) {
    setLastSignal(createSignal);
    setError("");
    setEditing(blankAssignment());
  }

  const courseTitle = useMemo(() => new Map(courses.map((c) => [c.id, c.title])), [courses]);

  async function save(form) {
    setSaving(true);
    setError("");
    try {
      if (form.id) await updateAssignment(form.id, form);
      else await createAssignment(form, teacherId);
      toast.success(form.id ? "Assignment updated." : "Assignment created as a draft.");
      setEditing(null);
    } catch (e) {
      setError(e.message || "Unable to save this assignment.");
    } finally {
      setSaving(false);
    }
  }

  function togglePublish(assignment) {
    const next = assignment.status === "published" ? "draft" : "published";
    return confirm({
      title: next === "published" ? "Publish assignment" : "Unpublish assignment",
      message: next === "published"
        ? `Publish "${assignment.title}"? Students in the class will see it immediately.`
        : `Unpublish "${assignment.title}"? Students will no longer see it.`,
      tone: next === "published" ? "success" : "danger",
      confirmLabel: next === "published" ? "Publish" : "Unpublish",
      onConfirm: async () => { await setAssignmentStatus(assignment.id, next); toast.success(`Assignment ${next}.`); },
    });
  }

  function remove(assignment) {
    return confirm({
      title: "Delete assignment",
      message: `Delete "${assignment.title}"? Students' submissions are kept for records, but the assignment itself will be gone.`,
      tone: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => { await deleteAssignment(assignment.id); toast.success("Assignment deleted."); },
    });
  }

  const actions = (assignment) => (
    <>
      <button type="button" onClick={() => { setError(""); setEditing({ ...blankAssignment(), ...assignment, maxScore: String(assignment.maxScore || 100) }); }} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-muted hover:bg-page hover:text-ink"><Pencil className="h-3.5 w-3.5" /> Edit</button>
      <button type="button" onClick={() => togglePublish(assignment)} className="rounded-lg px-2 py-1.5 text-info hover:bg-page">{assignment.status === "published" ? "Unpublish" : "Publish"}</button>
      <button type="button" onClick={() => setViewing(assignment)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-muted hover:bg-page hover:text-ink"><Users className="h-3.5 w-3.5" /> Submissions</button>
      <button type="button" onClick={() => remove(assignment)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-primary hover:bg-active"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
    </>
  );

  return (
    <>
      {loading ? (
        <p className="py-10 text-center text-sm text-muted">Loading assignments…</p>
      ) : !assignments.length ? (
        <div className="rounded-3xl border border-dashed border-border-subtle bg-card py-16 text-center">
          <p className="font-bold text-ink">No assignments yet.</p>
          <p className="mt-1 text-sm text-muted">Create one, then publish it so students in that class can submit their work.</p>
        </div>
      ) : layout === "list" ? (
        <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-card shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-page text-[10px] font-black uppercase tracking-wider text-muted">
              <tr>{["Assignment", "Training", "Due", "Max score", "Status", "Actions"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id} className="border-t border-border-subtle">
                  <td className="px-4 py-3 font-bold text-ink">{a.title}</td>
                  <td className="px-4 py-3 text-xs text-muted">{courseTitle.get(a.courseId) || "—"}</td>
                  <td className={`px-4 py-3 text-xs ${isOverdue(a.dueDate) ? "font-bold text-primary" : "text-muted"}`}>{a.dueDate || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted">{a.maxScore}</td>
                  <td className="px-4 py-3"><StatusPill status={a.status} /></td>
                  <td className="px-4 py-3"><div className="flex flex-wrap gap-1 text-xs font-bold">{actions(a)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assignments.map((a) => (
            <article key={a.id} className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <b className="block truncate text-ink">{a.title}</b>
                  <span className="text-xs text-muted">{courseTitle.get(a.courseId) || "Unknown training"}</span>
                </div>
                <StatusPill status={a.status} />
              </div>
              {a.instructions && <p className="line-clamp-2 text-xs text-muted">{a.instructions}</p>}
              <div className="flex flex-wrap gap-3 text-[11px] font-semibold text-subtle">
                <span className={`flex items-center gap-1 ${isOverdue(a.dueDate) ? "text-primary" : ""}`}><CalendarClock className="h-3.5 w-3.5" /> {dueLabel(a.dueDate)}</span>
                <span>{a.maxScore} points</span>
              </div>
              <div className="mt-auto flex flex-wrap gap-2 border-t border-border-subtle pt-3 text-xs font-bold">{actions(a)}</div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <Dialog title={editing.id ? "Edit assignment" : "Create assignment"} onClose={() => !saving && setEditing(null)} wide>
          <AssignmentForm
            initial={editing}
            courses={courses}
            teacherId={teacherId}
            isManager={isManager}
            saving={saving}
            error={error}
            onCancel={() => setEditing(null)}
            onSubmit={save}
          />
        </Dialog>
      )}
      {viewing && <SubmissionsDialog assignment={viewing} teacherId={teacherId} isManager={isManager} onClose={() => setViewing(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------
function SubmitDialog({ assignment, uid, existing, onClose }) {
  const [answer, setAnswer] = useState(existing?.answer || "");
  const [link, setLink] = useState(existing?.link || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await submitAssignment(assignment, uid, { answer, link }, existing);
      toast.success(existing ? "Submission updated." : "Assignment submitted.");
      onClose();
    } catch (e) {
      setError(e.message || "Unable to submit.");
      setSaving(false);
    }
  }

  return (
    <Dialog title={assignment.title} onClose={() => !saving && onClose()} wide>
      <form onSubmit={submit} className="space-y-4">
        {assignment.instructions && <p className="whitespace-pre-wrap rounded-xl bg-page p-3 text-sm text-ink">{assignment.instructions}</p>}
        {assignment.resourceUrl && (
          <a href={assignment.resourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-info hover:underline">
            <FileText className="h-3.5 w-3.5" /> Open assignment resource
          </a>
        )}
        <p className="text-xs text-muted">{dueLabel(assignment.dueDate)} · {assignment.maxScore} points</p>
        <label className={LABEL}>
          Your answer
          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={6} maxLength={10000} className={FIELD} />
        </label>
        <label className={LABEL}>
          Link to your work <span className="font-normal text-subtle">(optional — Google Drive, Docs, etc.)</span>
          <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className={FIELD} />
        </label>
        {error && <p className="rounded-xl bg-active px-3 py-2 text-sm text-primary">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted">Cancel</button>
          <button disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Submitting…" : existing ? "Update submission" : "Submit"}</button>
        </div>
      </form>
    </Dialog>
  );
}

export function StudentAssignments({ uid, enrollments, layout }) {
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [open, setOpen] = useState(null);
  const classKey = [...new Set(enrollments.map((e) => e.classId).filter(Boolean))].sort().join(",");
  const courseTitle = useMemo(() => new Map(enrollments.map((e) => [e.courseId, e.courseTitle])), [enrollments]);

  useEffect(() => subscribeClassAssignments(classKey ? classKey.split(",") : [], setAssignments, () => {}), [classKey]);
  useEffect(() => subscribeMySubmissions(uid, setSubmissions, () => {}), [uid]);
  const mine = useMemo(() => new Map(submissions.map((s) => [s.assignmentId, s])), [submissions]);

  const statusOf = (a) => {
    const s = mine.get(a.id);
    if (s?.score != null) return { label: `Graded ${s.score}/${a.maxScore}`, cls: "bg-success-soft text-success" };
    if (s) return { label: "Submitted", cls: "bg-info-soft text-info" };
    if (isOverdue(a.dueDate)) return { label: "Overdue", cls: "bg-active text-primary" };
    return { label: "To do", cls: "bg-warning-soft text-warning" };
  };
  const action = (a) => {
    const s = mine.get(a.id);
    if (s?.score != null) return <button type="button" onClick={() => setOpen(a)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-bold text-ink hover:bg-page">View</button>;
    return <button type="button" onClick={() => setOpen(a)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white">{s ? "Edit submission" : "Submit"}</button>;
  };

  if (!assignments.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border-subtle bg-card py-16 text-center">
        <p className="font-bold text-ink">No assignments yet.</p>
        <p className="mt-1 text-sm text-muted">Your teacher hasn&apos;t published an assignment for your class yet.</p>
      </div>
    );
  }

  const openSubmission = open ? mine.get(open.id) : null;
  return (
    <>
      {layout === "list" ? (
        <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-card shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-page text-[10px] font-black uppercase tracking-wider text-muted">
              <tr>{["Assignment", "Training", "Due", "Status", ""].map((h, i) => <th key={i} className="px-4 py-3">{h}</th>)}</tr>
            </thead>
            <tbody>
              {assignments.map((a) => {
                const status = statusOf(a);
                return (
                  <tr key={a.id} className="border-t border-border-subtle">
                    <td className="px-4 py-3 font-bold text-ink">{a.title}</td>
                    <td className="px-4 py-3 text-xs text-muted">{courseTitle.get(a.courseId) || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted">{a.dueDate || "—"}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>{status.label}</span></td>
                    <td className="px-4 py-3 text-right">{action(a)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {assignments.map((a) => {
            const status = statusOf(a);
            const s = mine.get(a.id);
            return (
              <article key={a.id} className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <b className="block text-ink">{a.title}</b>
                    <span className="text-xs text-muted">{courseTitle.get(a.courseId) || "Training"}</span>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${status.cls}`}>{status.label}</span>
                </div>
                <p className="flex items-center gap-1 text-[11px] font-semibold text-subtle"><CalendarClock className="h-3.5 w-3.5" /> {dueLabel(a.dueDate)} · {a.maxScore} points</p>
                {s?.feedback && <p className="rounded-xl bg-page p-2 text-xs text-ink"><b>Feedback:</b> {s.feedback}</p>}
                <div className="mt-auto border-t border-border-subtle pt-3">{action(a)}</div>
              </article>
            );
          })}
        </div>
      )}
      {open && (openSubmission?.score != null ? (
        <Dialog title={open.title} onClose={() => setOpen(null)}>
          <p className="text-3xl font-black text-ink">{openSubmission.score}/{open.maxScore}</p>
          {openSubmission.feedback && <p className="mt-3 rounded-xl bg-page p-3 text-sm text-ink">{openSubmission.feedback}</p>}
          {openSubmission.answer && <p className="mt-3 whitespace-pre-wrap text-xs text-muted">{openSubmission.answer}</p>}
        </Dialog>
      ) : (
        <SubmitDialog assignment={open} uid={uid} existing={openSubmission} onClose={() => setOpen(null)} />
      ))}
    </>
  );
}
