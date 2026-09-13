"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, FileText, Link2, PlayCircle, Type } from "lucide-react";
import {
  markLessonComplete,
  subscribeLessonCompletion,
  subscribeLessons,
  subscribeModules,
} from "../../lib/course-modules-data";
import LessonContentViewer from "./LessonContentViewer";

const CONTENT_ICON = { video: PlayCircle, pdf: FileText, document: FileText, link: Link2, text: Type, quiz: Circle };

function ModuleProgress({ percent }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-page">
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
    </div>
  );
}

// The read-only Student experience for a course's Modules — rendered by
// TrainingDetailsPage.jsx only after it has verified the Student has an
// active (non-withdrawn) enrollment for this exact course. Unpublished
// modules/lessons are filtered out here client-side (the same app-layer
// pattern DocumentsModule already uses — firestore.rules for this
// subcollection intentionally don't gate by status, only by
// admin/owning-teacher/enrolled-student).
export default function StudentCourseLearningView({ course, courseId, uid }) {
  const [modules, setModules] = useState([]);
  const [lessonsByModule, setLessonsByModule] = useState({});
  const [completions, setCompletions] = useState({});
  const [expandedModuleId, setExpandedModuleId] = useState("");
  const [activeLessonId, setActiveLessonId] = useState("");

  useEffect(() => {
    return subscribeModules(courseId, (rows) => setModules(rows.filter((item) => item.status === "Published")), () => {});
  }, [courseId]);

  useEffect(() => {
    const unsubscribers = modules.map((module) =>
      subscribeLessons(
        courseId,
        module.id,
        (rows) => setLessonsByModule((current) => ({ ...current, [module.id]: rows.filter((item) => item.status === "Published") })),
        () => {},
      ),
    );
    return () => unsubscribers.forEach((unsub) => unsub());
  }, [courseId, modules]);

  const flatLessons = useMemo(
    () => modules.flatMap((module) => (lessonsByModule[module.id] || []).map((lesson) => ({ ...lesson, moduleId: module.id }))),
    [modules, lessonsByModule],
  );

  useEffect(() => {
    const unsubscribers = flatLessons.map((lesson) =>
      subscribeLessonCompletion(courseId, lesson.moduleId, lesson.id, uid, (done) =>
        setCompletions((current) => ({ ...current, [lesson.id]: done })),
      ),
    );
    return () => unsubscribers.forEach((unsub) => unsub());
  }, [courseId, uid, flatLessons]);

  // React's documented "adjust state during rendering" pattern (not an
  // effect) for picking an initial selection the moment lessons first
  // arrive — setting state directly in the render body here is intentional
  // and safe: it only ever fires once (the condition becomes false
  // immediately after), so it can't loop.
  if (!activeLessonId && flatLessons.length) {
    setActiveLessonId(flatLessons[0].id);
    setExpandedModuleId(flatLessons[0].moduleId);
  }

  const activeIndex = flatLessons.findIndex((item) => item.id === activeLessonId);
  const activeLesson = activeIndex >= 0 ? flatLessons[activeIndex] : null;

  const overallTotal = flatLessons.length;
  const overallDone = flatLessons.filter((item) => completions[item.id]).length;
  const overallPercent = overallTotal ? Math.round((overallDone / overallTotal) * 100) : 0;

  function selectLesson(lesson) {
    setActiveLessonId(lesson.id);
    setExpandedModuleId(lesson.moduleId);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start">
      <div className="rounded-2xl border border-border-subtle bg-card p-4 shadow-sm lg:sticky lg:top-4">
        <p className="text-xs font-bold uppercase tracking-wider text-subtle">Training progress</p>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="font-bold text-ink">{overallPercent}%</span>
          <span className="text-muted">{overallDone}/{overallTotal} lessons</span>
        </div>
        <ModuleProgress percent={overallPercent} />

        <div className="mt-5 space-y-3">
          {modules.map((module) => {
            const lessons = lessonsByModule[module.id] || [];
            const done = lessons.filter((item) => completions[item.id]).length;
            const percent = lessons.length ? Math.round((done / lessons.length) * 100) : 0;
            const expanded = expandedModuleId === module.id;
            return (
              <div key={module.id} className="rounded-xl border border-border-subtle">
                <button
                  type="button"
                  onClick={() => setExpandedModuleId(expanded ? "" : module.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-page"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-ink">{module.title}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-subtle">{percent}% complete</span>
                  </span>
                </button>
                {expanded && (
                  <div className="space-y-0.5 border-t border-border-subtle p-1.5">
                    {lessons.length ? (
                      lessons.map((lesson) => {
                        const Icon = CONTENT_ICON[lesson.contentType] || Circle;
                        const isDone = Boolean(completions[lesson.id]);
                        const isActive = lesson.id === activeLessonId;
                        return (
                          <button
                            key={lesson.id}
                            type="button"
                            onClick={() => selectLesson({ ...lesson, moduleId: module.id })}
                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition ${
                              isActive ? "bg-active text-primary" : "text-ink hover:bg-page"
                            }`}
                          >
                            {isDone ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" /> : <Icon className="h-4 w-4 shrink-0 text-subtle" />}
                            <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                          </button>
                        );
                      })
                    ) : (
                      <p className="px-2.5 py-2 text-xs text-muted">No lessons yet.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {!modules.length && <p className="text-xs text-muted">No modules published yet for {course?.title || "this training"}.</p>}
        </div>
      </div>

      <div className="min-w-0">
        {activeLesson ? (
          <div className="space-y-4">
            <LessonContentViewer courseId={courseId} moduleId={activeLesson.moduleId} lesson={activeLesson} />
            <div className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
              <h3 className="text-lg font-bold text-ink">{activeLesson.title}</h3>
              {activeLesson.description && <p className="mt-1 text-sm text-muted">{activeLesson.description}</p>}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
                <button
                  type="button"
                  onClick={() => markLessonComplete(courseId, activeLesson.moduleId, activeLesson.id, uid)}
                  disabled={completions[activeLesson.id]}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {completions[activeLesson.id] ? "Completed" : "Mark as Complete"}
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={activeIndex <= 0}
                    onClick={() => selectLesson(flatLessons[activeIndex - 1])}
                    className="flex items-center gap-1 rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Previous
                  </button>
                  <button
                    type="button"
                    disabled={activeIndex < 0 || activeIndex >= flatLessons.length - 1}
                    onClick={() => selectLesson(flatLessons[activeIndex + 1])}
                    className="flex items-center gap-1 rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink disabled:opacity-40"
                  >
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid place-items-center rounded-2xl border border-dashed border-border-subtle bg-card p-16 text-center">
            <p className="text-sm text-muted">Nothing published for this training yet — check back soon.</p>
          </div>
        )}
      </div>
    </div>
  );
}
