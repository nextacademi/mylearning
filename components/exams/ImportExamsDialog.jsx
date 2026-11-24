"use client";

import { useEffect, useState } from "react";
import { FileUp } from "lucide-react";
import { subscribeModules } from "../../lib/course-modules-data";
import { parseExamImport } from "../../lib/exam-shared";

const LABEL = "grid gap-1 text-xs font-bold text-muted";
const FIELD = "rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary";
const MAX_FILE_BYTES = 5 * 1024 * 1024;

// Body of the "Import exams" dialog in Model Test. Reads a Next Academy exam
// file (.json, see parseExamImport in lib/exam-shared.js) in the browser,
// shows what it holds, then creates every exam through the normal create path
// (`onImport` = createQuiz), so each one is an ordinary quiz saved as a DRAFT.
// Nothing is written until the staff member presses Import.
export default function ImportExamsDialog({ courses, onCancel, onImport, onDone }) {
  const [courseId, setCourseId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [modules, setModules] = useState([]);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState(null);
  const [progress, setProgress] = useState(null);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    if (!courseId) return undefined;
    return subscribeModules(courseId, setModules, () => setModules([]));
  }, [courseId]);
  const courseModules = courseId ? modules : [];
  const busy = progress != null && progress.done < progress.total && !failure;

  async function pickFile(e) {
    const file = e.target.files?.[0];
    setFailure("");
    setProgress(null);
    if (!file) {
      setFileName("");
      setParsed(null);
      return;
    }
    setFileName(file.name);
    if (file.size > MAX_FILE_BYTES) {
      setParsed({ exams: [], errors: ["This file is larger than 5 MB."] });
      return;
    }
    try {
      setParsed(parseExamImport(await file.text()));
    } catch {
      setParsed({ exams: [], errors: ["Unable to read this file."] });
    }
  }

  async function runImport(e) {
    e.preventDefault();
    if (!parsed?.exams.length || !courseId || busy) return;
    const exams = parsed.exams;
    setFailure("");
    setProgress({ done: 0, total: exams.length });
    for (let i = 0; i < exams.length; i += 1) {
      const exam = exams[i];
      try {
        await onImport({ ...exam, courseId, moduleId });
      } catch (error) {
        setFailure(`Imported ${i} of ${exams.length}. Stopped at "${exam.title}": ${error?.message || "unable to save"}. The ones already imported are drafts; you can delete them or import the rest again.`);
        return;
      }
      setProgress({ done: i + 1, total: exams.length });
    }
    onDone(exams.length);
  }

  const exams = parsed?.exams || [];
  const totals = exams.reduce((acc, exam) => ({ questions: acc.questions + exam.questions.length, points: acc.points + exam.totalPoints }), { questions: 0, points: 0 });

  return (
    <form onSubmit={runImport} className="space-y-4">
      <p className="text-sm text-muted">
        Upload a Next Academy exam file (.json). Every exam in it is created as a <b className="text-ink">draft</b> in the course you pick; students see nothing until you publish.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Course
          <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setModuleId(""); }} required disabled={busy} className={FIELD}>
            <option value="">Select a course</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        <label className={LABEL}>
          Module <span className="font-normal text-subtle">(optional: whole course if blank)</span>
          <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} disabled={!courseId || busy} className={FIELD}>
            <option value="">Whole course</option>
            {courseModules.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </label>
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-border-subtle p-4 text-sm hover:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary">
        <FileUp className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <b className="block text-ink">{fileName || "Choose exam file"}</b>
          <span className="text-xs text-muted">.json, up to 5 MB</span>
        </span>
        <input type="file" accept=".json,application/json" onChange={pickFile} disabled={busy} className="sr-only" />
      </label>

      {parsed?.errors.length > 0 && (
        <div className="rounded-xl bg-active px-3 py-2 text-sm text-primary" role="alert">
          <p className="font-bold">This file can&apos;t be imported:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {parsed.errors.slice(0, 12).map((message) => <li key={message}>{message}</li>)}
            {parsed.errors.length > 12 && <li>…and {parsed.errors.length - 12} more.</li>}
          </ul>
        </div>
      )}

      {exams.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-muted">
            {exams.length} exam{exams.length === 1 ? "" : "s"} · {totals.questions} questions · {totals.points} points in all
          </p>
          <div className="max-h-72 overflow-auto rounded-xl border border-border-subtle">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead className="sticky top-0 bg-page text-[10px] font-black uppercase tracking-wider text-muted">
                <tr><th className="px-3 py-2">Exam</th><th className="px-3 py-2">Questions</th><th className="px-3 py-2">Points</th><th className="px-3 py-2">Passages</th><th className="px-3 py-2">Time</th><th className="px-3 py-2">Attempts</th></tr>
              </thead>
              <tbody>
                {exams.map((exam, index) => (
                  <tr key={index} className="border-t border-border-subtle">
                    <td className="px-3 py-2 font-bold text-ink">{exam.title}</td>
                    <td className="px-3 py-2 text-muted">{exam.questions.length}</td>
                    <td className="px-3 py-2 text-muted">{exam.totalPoints}</td>
                    <td className="px-3 py-2 text-muted">{exam.passages.length || "—"}</td>
                    <td className="px-3 py-2 text-muted">{exam.timeLimitMinutes ? `${exam.timeLimitMinutes} min` : "—"}</td>
                    <td className="px-3 py-2 text-muted">{exam.maxAttempts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {progress && !failure && (
        <p className="text-sm font-semibold text-ink" role="status">Importing {progress.done} of {progress.total}…</p>
      )}
      {failure && <p className="rounded-xl bg-active px-3 py-2 text-sm text-primary" role="alert">{failure}</p>}

      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onCancel} disabled={busy} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted">Cancel</button>
        <button disabled={!exams.length || !courseId || busy || Boolean(failure)} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "Importing…" : `Import ${exams.length || ""} as draft${exams.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </form>
  );
}
