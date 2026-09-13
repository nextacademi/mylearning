"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Pencil, Plus, Trash2, Users } from "lucide-react";
import { subscribeTeacherCourses } from "../../lib/teacher-data";
import { subscribeCourses } from "../../lib/room-booking-data";
import {
  createQuiz, deleteQuiz, loadQuizAnswerKey, setQuizStatus, subscribeAllQuizzes,
  subscribeQuizAttemptsForQuiz, subscribeQuizAttemptsForTeacher, subscribeTeacherQuizzes, updateQuiz,
} from "../../lib/exam-data";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";

const LABEL = "grid gap-1 text-xs font-bold text-muted";
const FIELD = "rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary";
const blankQuestion = () => ({ text: "", options: ["", ""], correctOptionIndex: 0 });
const blankForm = () => ({ courseId: "", title: "", description: "", timeLimitMinutes: "", maxAttempts: "1", questions: [blankQuestion()] });

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

function QuestionEditor({ question, index, onChange, onRemove, canRemove }) {
  function setField(field, value) {
    onChange(index, { ...question, [field]: value });
  }
  function setOption(optIndex, value) {
    const options = question.options.map((opt, i) => (i === optIndex ? value : opt));
    setField("options", options);
  }
  function addOption() {
    if (question.options.length >= 6) return;
    setField("options", [...question.options, ""]);
  }
  function removeOption(optIndex) {
    if (question.options.length <= 2) return;
    const options = question.options.filter((_, i) => i !== optIndex);
    const correctOptionIndex = question.correctOptionIndex >= options.length ? 0 : question.correctOptionIndex;
    onChange(index, { ...question, options, correctOptionIndex });
  }
  return (
    <div className="space-y-3 rounded-2xl border border-border-subtle p-4">
      <div className="flex items-start justify-between gap-3">
        <label className={`${LABEL} flex-1`}>
          Question {index + 1}
          <input value={question.text} onChange={(e) => setField("text", e.target.value)} required maxLength={500} className={FIELD} placeholder="What is..." />
        </label>
        {canRemove && (
          <button type="button" onClick={() => onRemove(index)} className="mt-6 rounded-lg p-1.5 text-muted hover:bg-active hover:text-primary" aria-label="Remove question">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="space-y-2">
        {question.options.map((option, optIndex) => (
          <div key={optIndex} className="flex items-center gap-2">
            <input
              type="radio"
              name={`correct-${index}`}
              checked={question.correctOptionIndex === optIndex}
              onChange={() => setField("correctOptionIndex", optIndex)}
              aria-label={`Mark option ${optIndex + 1} correct`}
            />
            <input
              value={option}
              onChange={(e) => setOption(optIndex, e.target.value)}
              required
              maxLength={200}
              placeholder={`Option ${optIndex + 1}`}
              className={`${FIELD} flex-1 py-2`}
            />
            {question.options.length > 2 && (
              <button type="button" onClick={() => removeOption(optIndex)} className="text-xs font-bold text-primary hover:underline">Remove</button>
            )}
          </div>
        ))}
        {question.options.length < 6 && (
          <button type="button" onClick={addOption} className="text-xs font-bold text-info hover:underline">+ Add option</button>
        )}
      </div>
      <label className={LABEL}>
        Points <span className="font-normal text-subtle">(default 1)</span>
        <input type="number" min="1" value={question.points || ""} onChange={(e) => setField("points", e.target.value)} className={`${FIELD} w-24`} />
      </label>
    </div>
  );
}

function QuizForm({ initial, courses, saving, error, onCancel, onSubmit }) {
  const [form, setForm] = useState(initial);
  function set(field) {
    return (e) => setForm((c) => ({ ...c, [field]: e.target.value }));
  }
  function setQuestion(index, next) {
    setForm((c) => ({ ...c, questions: c.questions.map((q, i) => (i === index ? next : q)) }));
  }
  function addQuestion() {
    setForm((c) => ({ ...c, questions: [...c.questions, blankQuestion()] }));
  }
  function removeQuestion(index) {
    setForm((c) => ({ ...c, questions: c.questions.filter((_, i) => i !== index) }));
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Course
          <select value={form.courseId} onChange={set("courseId")} required className={FIELD}>
            <option value="">Select a course</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        <label className={LABEL}>
          Exam title
          <input value={form.title} onChange={set("title")} required maxLength={160} className={FIELD} placeholder="Midterm Quiz" />
        </label>
      </div>
      <label className={LABEL}>
        Description <span className="font-normal text-subtle">(optional)</span>
        <textarea value={form.description} onChange={set("description")} rows={2} maxLength={1000} className={FIELD} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Time limit (minutes) <span className="font-normal text-subtle">(optional — untimed if blank)</span>
          <input type="number" min="1" value={form.timeLimitMinutes} onChange={set("timeLimitMinutes")} className={FIELD} />
        </label>
        <label className={LABEL}>
          Attempts allowed
          <input type="number" min="1" value={form.maxAttempts} onChange={set("maxAttempts")} className={FIELD} />
        </label>
      </div>

      <p className="text-xs font-bold uppercase tracking-wider text-subtle">Questions</p>
      <div className="space-y-3">
        {form.questions.map((question, index) => (
          <QuestionEditor key={index} question={question} index={index} onChange={setQuestion} onRemove={removeQuestion} canRemove={form.questions.length > 1} />
        ))}
      </div>
      <button type="button" onClick={addQuestion} className="flex items-center gap-1.5 rounded-xl border border-dashed border-border-subtle px-4 py-2.5 text-xs font-bold text-muted hover:border-primary hover:text-primary">
        <Plus className="h-4 w-4" /> Add question
      </button>

      {error && <p className="rounded-xl bg-active px-3 py-2 text-sm text-primary">{error}</p>}
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted">Cancel</button>
        <button disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? "Saving…" : "Save exam"}</button>
      </div>
    </form>
  );
}

function ResultsPanel({ quiz, teacherId, isManager, onClose }) {
  const [attempts, setAttempts] = useState([]);
  useEffect(() => {
    if (isManager) return subscribeQuizAttemptsForQuiz(quiz.id, setAttempts, () => {});
    return subscribeQuizAttemptsForTeacher(teacherId, quiz.id, setAttempts, () => {});
  }, [teacherId, quiz.id, isManager]);
  return (
    <Dialog title={`Results — ${quiz.title}`} onClose={onClose} wide>
      {!attempts.length ? (
        <p className="py-8 text-center text-sm text-muted">No submissions yet.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border-subtle">
          <table className="w-full text-left text-sm">
            <thead className="bg-page text-[10px] uppercase tracking-wider text-subtle">
              <tr><th className="p-3">Student</th><th className="p-3">Attempt</th><th className="p-3 text-right">Score</th><th className="p-3 text-right">Percentage</th></tr>
            </thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id} className="border-t border-border-subtle">
                  <td className="p-3 font-mono text-xs text-muted">{a.studentId}</td>
                  <td className="p-3 text-muted">#{a.attemptNumber || 1}</td>
                  <td className="p-3 text-right font-bold text-ink">{a.score}/{a.maxScore}</td>
                  <td className="p-3 text-right text-muted">{a.percentage}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
}

export default function TeacherExams({ teacherId, isManager = false }) {
  const [courses, setCourses] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewingResults, setViewingResults] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    if (isManager) return subscribeCourses(setCourses, () => {});
    return subscribeTeacherCourses(teacherId, setCourses, () => {});
  }, [teacherId, isManager]);
  useEffect(() => {
    if (isManager) return subscribeAllQuizzes(setQuizzes, () => {});
    return subscribeTeacherQuizzes(teacherId, setQuizzes, () => {});
  }, [teacherId, isManager]);

  const courseMap = useMemo(() => new Map(courses.map((c) => [c.id, c.title])), [courses]);

  function openCreate() {
    setError("");
    setCreating(true);
  }
  async function openEdit(quiz) {
    setError("");
    const key = await loadQuizAnswerKey(quiz.id);
    setEditing({
      id: quiz.id,
      ownerTeacherId: quiz.teacherId,
      courseId: quiz.courseId,
      title: quiz.title,
      description: quiz.description || "",
      timeLimitMinutes: quiz.timeLimitMinutes || "",
      maxAttempts: String(quiz.maxAttempts || 1),
      questions: quiz.questions.map((q) => ({ ...q, points: key.points?.[q.id] || 1, correctOptionIndex: key.answers?.[q.id] ?? 0 })),
    });
  }
  function close() {
    setCreating(false);
    setEditing(null);
  }

  async function submit(form) {
    setSaving(true);
    setError("");
    try {
      const payload = { ...form, questions: form.questions.map((q) => ({ ...q, correctOptionIndex: Number(q.correctOptionIndex) })) };
      if (editing) await updateQuiz(editing.id, editing.ownerTeacherId || teacherId, payload);
      else await createQuiz(teacherId, payload);
      close();
      toast.success(editing ? "Exam updated." : "Exam created as a draft.");
    } catch (e) {
      setError(e.message || "Unable to save this exam.");
    } finally {
      setSaving(false);
    }
  }

  function togglePublish(quiz) {
    const next = quiz.status === "published" ? "draft" : "published";
    return confirm({
      title: next === "published" ? "Publish exam" : "Unpublish exam",
      message: next === "published"
        ? `Publish "${quiz.title}"? Enrolled students will immediately be able to take it.`
        : `Unpublish "${quiz.title}"? Students will no longer be able to start new attempts.`,
      tone: next === "published" ? "success" : "danger",
      confirmLabel: next === "published" ? "Publish" : "Unpublish",
      onConfirm: async () => { await setQuizStatus(quiz.id, next); toast.success(`Exam ${next}.`); },
    });
  }

  function remove(quiz) {
    return confirm({
      title: "Delete exam",
      message: `Delete "${quiz.title}"? This cannot be undone. Past student submissions are kept for records but the exam itself will be gone.`,
      tone: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => { await deleteQuiz(quiz.id); toast.success("Exam deleted."); },
    });
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 text-ink shadow-xl">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-active p-3"><ClipboardList className="h-7 w-7 text-primary" aria-hidden="true" /></div>
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">Exams &amp; Quizzes</h2>
            <p className="mt-1 text-sm text-muted">
              {isManager
                ? "Oversee every exam across the academy — students take them online, graded automatically."
                : "Create exams for your courses — students take them online, graded automatically."}
            </p>
          </div>
        </div>
        <button type="button" onClick={openCreate} disabled={!courses.length} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-xs font-bold text-white disabled:opacity-50">
          <Plus className="h-4 w-4" /> Create Exam
        </button>
      </section>

      {!isManager && !courses.length && (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">You have no assigned courses yet — an exam must belong to one of your courses.</p>
      )}

      {!quizzes.length ? (
        <div className="rounded-3xl border border-dashed border-border-subtle bg-card py-16 text-center">
          <p className="font-bold text-ink">No exams yet.</p>
          <p className="mt-1 text-sm text-muted">Create your first exam to start testing students on a course.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {quizzes.map((quiz) => (
            <article key={quiz.id} className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <b className="block truncate text-ink">{quiz.title}</b>
                  <span className="text-xs text-muted">{courseMap.get(quiz.courseId) || "Unknown course"}</span>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${quiz.status === "published" ? "bg-success-soft text-success" : "bg-page text-muted"}`}>{quiz.status}</span>
              </div>
              <div className="flex flex-wrap gap-3 text-[11px] font-semibold text-subtle">
                <span>{quiz.questions?.length || 0} questions</span>
                <span>{quiz.totalPoints || 0} points</span>
                <span>{quiz.maxAttempts || 1} attempt{quiz.maxAttempts === 1 ? "" : "s"}</span>
                {quiz.timeLimitMinutes && <span>{quiz.timeLimitMinutes} min</span>}
              </div>
              <div className="mt-1 flex flex-wrap gap-2 border-t border-border-subtle pt-3 text-xs font-bold">
                <button type="button" onClick={() => openEdit(quiz)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-muted hover:bg-page hover:text-ink"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                <button type="button" onClick={() => togglePublish(quiz)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-info hover:bg-page">{quiz.status === "published" ? "Unpublish" : "Publish"}</button>
                <button type="button" onClick={() => setViewingResults(quiz)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-muted hover:bg-page hover:text-ink"><Users className="h-3.5 w-3.5" /> Results</button>
                <button type="button" onClick={() => remove(quiz)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-primary hover:bg-active"><Trash2 className="h-3.5 w-3.5" /> Delete</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {creating && (
        <Dialog title="Create exam" onClose={close} wide>
          <QuizForm initial={blankForm()} courses={courses} saving={saving} error={error} onCancel={close} onSubmit={submit} />
        </Dialog>
      )}
      {editing && (
        <Dialog title="Edit exam" onClose={close} wide>
          <QuizForm initial={editing} courses={courses} saving={saving} error={error} onCancel={close} onSubmit={submit} />
        </Dialog>
      )}
      {viewingResults && <ResultsPanel quiz={viewingResults} teacherId={teacherId} isManager={isManager} onClose={() => setViewingResults(null)} />}
    </div>
  );
}
