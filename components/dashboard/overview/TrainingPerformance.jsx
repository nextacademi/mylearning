"use client";

import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { ErrorChartState } from "./ChartCard";
import { SkeletonList } from "../../ui/Skeleton";

const FILTERS = ["All", "Active", "Upcoming", "Completed"];

export default function TrainingPerformance({ courses, loading, error, onRetry, onNavigate }) {
  const [filter, setFilter] = useState("All");

  const rows = useMemo(() => {
    if (!courses) return [];
    return filter === "All" ? courses : courses.filter((course) => course.status === filter);
  }, [courses, filter]);

  return (
    <div className="rounded-xl border border-border-subtle bg-card p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-active text-primary">
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-ink">Training Performance</h3>
            <p className="text-xs text-muted">Enrollment and staffing at a glance, per training</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === item ? "bg-primary text-white" : "bg-page text-muted hover:bg-active hover:text-primary"}`}
            >
              {item}
            </button>
          ))}
          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate("Training")}
              className="rounded-full border border-border-subtle px-3 py-1.5 text-xs font-bold text-primary hover:bg-active"
            >
              View All Trainings →
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <SkeletonList count={6} />
      ) : error ? (
        <ErrorChartState message="Unable to load training performance" onRetry={onRetry} />
      ) : rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b text-[10px] uppercase tracking-wider text-subtle">
              <tr>
                {["Training", "Training ID", "Students", "Classes/Batches", "Teacher", "Status"].map((label) => (
                  <th key={label} className="p-3">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((course) => (
                <tr key={course.id} className="border-b border-border-subtle last:border-0">
                  <td className="p-3 font-semibold text-ink">{course.title || "Untitled training"}</td>
                  <td className="p-3 font-mono text-xs text-muted">{course.courseCode}</td>
                  <td className="p-3 text-xs text-ink">{course.enrolled} Student{course.enrolled === 1 ? "" : "s"}</td>
                  <td className="p-3 text-xs text-ink">{course.classCount} Batch{course.classCount === 1 ? "" : "es"}</td>
                  <td className="p-3 text-xs text-muted">
                    {course.teachers?.length ? course.teachers.map((t) => t.displayName || t.email).join(", ") : "Unassigned"}
                  </td>
                  <td className="p-3">
                    <span className="rounded-full bg-active px-2.5 py-1 text-[10px] font-bold text-primary">
                      {course.status || "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted">
          {filter === "All" ? "No training data yet" : `No ${filter.toLowerCase()} trainings.`}
        </p>
      )}
    </div>
  );
}
