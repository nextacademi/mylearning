"use client";

import { useMemo, useState } from "react";
import { AlarmClock, FileWarning, UsersRound } from "lucide-react";
import DataTable from "../data-table/DataTable";
import { assignmentNumberLabel } from "../../lib/assignment-shared";
import { batchLabel, outstandingRows } from "./portal-view";

const formatDay = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

function Summary({ icon: Icon, label, value, tone }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-card p-4 shadow-sm">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <div>
        <p className="text-2xl font-black text-ink">{value}</p>
        <p className="text-xs font-semibold text-muted">{label}</p>
      </div>
    </div>
  );
}

// Outstanding list: every student who still owes an assignment, with the
// ones they're missing (overdue in red).
export default function OutstandingList({ batches, canManage, onRecord }) {
  const [overdueOnly, setOverdueOnly] = useState(false);
  const rows = useMemo(() => outstandingRows(batches, { overdueOnly }), [batches, overdueOnly]);
  const students = new Set(rows.map((r) => r.studentId)).size;
  const missing = rows.reduce((sum, r) => sum + r.missing.length, 0);
  const overdue = rows.reduce((sum, r) => sum + r.overdue, 0);

  const columns = [
    {
      key: "name", header: "Student", sortable: true, accessor: (r) => r.name, sortValue: (r) => `${r.name} ${r.email}`,
      render: (r) => <span className="block min-w-36"><b className="block text-ink">{r.name}</b><span className="text-xs text-muted">{r.userId || "—"}</span></span>,
    },
    {
      key: "contact", header: "Contact", accessor: (r) => [r.phone, r.email].filter(Boolean).join(" · "),
      render: (r) => <span className="block text-xs text-muted">{r.phone && <span className="block font-semibold text-ink">{r.phone}</span>}{r.email}</span>,
    },
    {
      key: "batch", header: "Training batch", sortable: true, accessor: (r) => batchLabel(r.batch),
      render: (r) => <span className="block min-w-36"><b className="block text-xs text-primary">{r.batch.courseCode}</b><span className="text-xs text-ink">{r.batch.title}</span></span>,
    },
    {
      key: "count", header: "Missing", align: "center", sortable: true, searchable: false, accessor: (r) => r.missing.length,
      render: (r) => <span className="rounded-full bg-active px-2.5 py-1 text-xs font-black text-primary">{r.missing.length}</span>,
    },
    {
      key: "missing", header: "Assignments missing", accessor: (r) => r.missing.map((item) => `${assignmentNumberLabel(item.number)}: ${item.title}`).join(", "),
      exportValue: (r) => r.missing.map((item) => `${assignmentNumberLabel(item.number)} ${item.title}${item.dueDate ? ` (due ${item.dueDate})` : ""}`).join("; "),
      render: (r) => (
        <span className="flex min-w-60 flex-wrap gap-1.5">
          {r.missing.map((item) => (
            <span
              key={item.id}
              title={item.title}
              className={`rounded-lg border px-2 py-1 text-[11px] font-semibold ${item.overdue ? "border-primary/30 bg-active text-primary" : "border-border-subtle bg-page text-muted"}`}
            >
              <b>{assignmentNumberLabel(item.number)}</b> · {item.title}{item.dueDate ? ` · ${item.overdue ? "was due" : "due"} ${formatDay(item.dueDate)}` : ""}
            </span>
          ))}
        </span>
      ),
    },
  ];

  return (
    <section className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Summary icon={UsersRound} label="Students with missing work" value={students} tone="bg-active text-primary" />
        <Summary icon={FileWarning} label="Assignments not submitted" value={missing} tone="bg-warning-soft text-warning" />
        <Summary icon={AlarmClock} label="Past their due date" value={overdue} tone="bg-active text-primary" />
      </div>
      <div className="space-y-4 rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
        <div>
          <h3 className="text-lg font-bold text-ink">Outstanding Assignments</h3>
          <p className="text-sm text-muted">Students who still have to hand in work, and which assignments.</p>
        </div>
        <DataTable
          title="students"
          name="outstanding-assignments"
          columns={columns}
          rows={rows}
          getRowId={(r) => r.key}
          initialSort={{ key: "count", dir: "desc" }}
          pageSize={20}
          emptyLabel={overdueOnly ? "Nobody has an overdue assignment." : "Everyone is up to date — no missing assignments."}
          toolbar={(
            <label className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs font-bold text-ink shadow-sm">
              <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} className="h-4 w-4 accent-[#ff2d2d]" />
              Only past due date
            </label>
          )}
          actionsHeader={canManage ? "Action" : undefined}
          rowActions={canManage ? (r) => (
            <button type="button" onClick={() => onRecord(r.batch.id, r.studentId)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-bold text-ink hover:bg-page">
              Record
            </button>
          ) : undefined}
        />
      </div>
    </section>
  );
}
