"use client";

import { useMemo } from "react";
import { BriefcaseBusiness } from "lucide-react";

// Computed entirely from data the page already fetched for the 6 KPI cards
// (teachers/courses/classes/students) — no new query.
export default function TeacherWorkload({ teachers, courses, classes, students, loading }) {
  const rows = useMemo(() => {
    if (!teachers) return [];
    return teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.displayName || teacher.email || "Unnamed teacher",
      trainings: (courses || []).filter((course) => (course.teacherIds || []).includes(teacher.id)).length,
      batches: (classes || []).filter((cls) => (cls.teacherIds || []).includes(teacher.id)).length,
      students: (students || []).filter((student) => (student.teacherIds || []).includes(teacher.id)).length,
    }));
  }, [teachers, courses, classes, students]);

  return (
    <div className="rounded-xl border border-border-subtle bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-purple-soft text-purple">
          <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-lg font-bold text-ink">Teacher Workload</h3>
          <p className="text-xs text-muted">Real assignment load per teacher</p>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">Loading teacher workload...</p>
      ) : rows.length ? (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-2 px-3 text-[10px] font-bold uppercase tracking-wider text-subtle">
            <span>Teacher</span>
            <span className="text-center">Trainings</span>
            <span className="text-center">Batches</span>
            <span className="text-center">Students</span>
          </div>
          {rows.map((row) => (
            <div key={row.id} className="grid grid-cols-4 items-center gap-2 rounded-xl bg-page px-3 py-2.5 text-xs">
              <span className="truncate font-semibold text-ink">{row.name}</span>
              <span className="text-center font-bold text-info">{row.trainings}</span>
              <span className="text-center font-bold text-teal">{row.batches}</span>
              <span className="text-center font-bold text-purple">{row.students}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted">No teacher assignments yet.</p>
      )}
    </div>
  );
}
