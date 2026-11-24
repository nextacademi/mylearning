import { Check, X } from "lucide-react";

const formatDay = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

// ✓ submitted · ✗ missing · — not set for this student. `detail` adds the
// score / "late" line under a tick.
export default function StatusMark({ status, submission, assignment, detail = false, size = "h-8 w-8" }) {
  if (status === "none") return <span className="text-xs text-subtle" title="Not set for this student">—</span>;
  if (status === "missing") {
    const due = assignment?.dueDate ? ` (due ${formatDay(assignment.dueDate)})` : "";
    return (
      <span className={`inline-flex ${size} items-center justify-center rounded-full border border-primary/30 bg-active text-primary`} title={`Missing${due}`}>
        <X className="h-4 w-4" strokeWidth={3} aria-label="Missing" />
      </span>
    );
  }
  const extra = detail ? [submission?.score != null ? `${submission.score} pts` : "", submission?.late ? "late" : ""].filter(Boolean).join(" · ") : "";
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span className={`inline-flex ${size} items-center justify-center rounded-full border border-success/30 bg-success-soft text-success`} title={submission?.late ? "Submitted late" : "Submitted"}>
        <Check className="h-4 w-4" strokeWidth={3} aria-label="Submitted" />
      </span>
      {extra && <span className="text-[11px] font-semibold text-muted">{extra}</span>}
    </span>
  );
}
