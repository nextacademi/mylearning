"use client";

import { Check } from "lucide-react";

// One shared status-picker control, used everywhere a Present/Absent/Late/
// Excused value is chosen while marking attendance (Director/Admin's
// AttendanceMarkGrid in TrainingDetailsPage.jsx and Teacher's own
// AttendanceView in TeacherWorkspacePage.js) — a single component so the
// two call sites can never visually drift apart, per "no second attendance
// system." Purely presentational: it only reports the chosen status string
// back via onChange, using the exact same four values ("present", "absent",
// "late", "excused") the existing schema/business logic already uses.
const STATUSES = [
  { value: "present", label: "Present", selectedClass: "border-success bg-success text-white" },
  { value: "absent", label: "Absent", selectedClass: "border-primary bg-primary text-white" },
  { value: "late", label: "Late", selectedClass: "border-warning bg-warning text-white" },
  { value: "excused", label: "Excused", selectedClass: "border-info bg-info text-white" },
];

export default function AttendanceStatusPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {STATUSES.map((status) => {
        const selected = value === status.value;
        return (
          <button
            key={status.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(status.value)}
            className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${
              selected
                ? `${status.selectedClass} shadow-sm`
                : "border-border-subtle bg-card text-muted hover:bg-page"
            }`}
          >
            {selected && <Check className="h-3 w-3" aria-hidden="true" />}
            {status.label}
          </button>
        );
      })}
    </div>
  );
}
