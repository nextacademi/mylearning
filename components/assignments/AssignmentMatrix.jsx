"use client";

import { useMemo } from "react";
import DataTable from "../data-table/DataTable";
import StatusMark from "./StatusMark";
import { assignmentNumberLabel } from "../../lib/assignment-shared";
import { batchLabel, doneCount, matrixCell, matrixNumbers, matrixRows, percent } from "./portal-view";

const formatDay = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
const SORT_RANK = { done: 2, missing: 1, none: 0 };
const EXPORT_TEXT = { done: "Submitted", missing: "Missing", none: "—" };

// Submission Table: student names down the left, Assignment 01, 02, …
// across, ✓ / ✗ in each cell. One row per student per training batch, so a
// student in two trainings shows twice (their assignments differ).
export default function AssignmentMatrix({ batches: allBatches, canManage, onRecord }) {
  // A training with no published assignment has no columns to show.
  const batches = useMemo(() => allBatches.filter((batch) => batch.assignments.length), [allBatches]);
  const rows = useMemo(() => matrixRows(batches), [batches]);
  const numbers = useMemo(() => matrixNumbers(batches), [batches]);
  const single = batches.length === 1 ? batches[0] : null;

  const columns = [
    {
      key: "name", header: "Student", sortable: true, accessor: (r) => r.name, sortValue: (r) => `${r.name} ${r.email}`,
      render: (r) => <span className="block min-w-36"><b className="block text-ink">{r.name}</b><span className="text-xs text-muted">{r.userId || r.email}</span></span>,
    },
    { key: "email", header: "Email", accessor: (r) => r.email, render: (r) => <span className="text-xs text-muted">{r.email || "—"}</span> },
    ...(single ? [] : [{
      key: "batch", header: "Training batch", sortable: true, accessor: (r) => batchLabel(r.batch),
      render: (r) => <span className="block min-w-36"><b className="block text-xs text-primary">{r.batch.courseCode}</b><span className="text-xs text-ink">{r.batch.title}</span></span>,
    }]),
    ...numbers.map((number) => ({
      key: `n${number}`,
      header: assignmentNumberLabel(number),
      align: "center",
      sortable: true,
      searchable: false,
      accessor: (r) => SORT_RANK[matrixCell(r, number).status],
      exportValue: (r) => EXPORT_TEXT[matrixCell(r, number).status],
      render: (r) => {
        const cell = matrixCell(r, number);
        return <StatusMark status={cell.status} submission={cell.submission} assignment={cell.assignment} size="h-7 w-7" />;
      },
    })),
    {
      key: "progress", header: "Submitted", align: "center", sortable: true, searchable: false,
      accessor: (r) => percent(doneCount(r), r.expected.length),
      exportValue: (r) => `${doneCount(r)}/${r.expected.length}`,
      render: (r) => (
        <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${r.expected.length && doneCount(r) === r.expected.length ? "bg-success-soft text-success" : "bg-page text-ink"}`}>
          {doneCount(r)}/{r.expected.length}
        </span>
      ),
      filter: {
        placeholder: "All students",
        options: [{ value: "missing", label: "Has missing work" }, { value: "complete", label: "All submitted" }],
        predicate: (r, value) => (value === "missing" ? doneCount(r) < r.expected.length : r.expected.length > 0 && doneCount(r) === r.expected.length),
      },
    },
  ];

  return (
    <section className="space-y-4 rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-ink">Assignment Submission Table</h3>
          <p className="text-sm text-muted">{single ? batchLabel(single) : `${batches.length} training batch${batches.length === 1 ? "" : "es"}`} · {rows.length} student{rows.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-muted">
          <span className="inline-flex items-center gap-1.5"><StatusMark status="done" size="h-5 w-5" /> Submitted</span>
          <span className="inline-flex items-center gap-1.5"><StatusMark status="missing" size="h-5 w-5" /> Missing</span>
          <span className="inline-flex items-center gap-1.5"><StatusMark status="none" /> Not set</span>
        </div>
      </div>
      {single && single.assignments.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          {single.assignments.map((item) => (
            <span key={item.id} className="rounded-full border border-border-subtle bg-page px-3 py-1 text-muted">
              <b className="text-ink">{assignmentNumberLabel(item.number)}:</b> {item.title}{item.dueDate ? ` · due ${formatDay(item.dueDate)}` : ""}
            </span>
          ))}
        </div>
      )}
      {!numbers.length ? (
        <p className="rounded-xl border border-dashed border-border-subtle p-8 text-center text-sm text-muted">No published assignment matches these filters.</p>
      ) : (
        <DataTable
          title="students"
          name="assignment-submission-table"
          columns={columns}
          rows={rows}
          getRowId={(r) => r.key}
          initialSort={{ key: "name", dir: "asc" }}
          pageSize={25}
          dense
          emptyLabel="No students enrolled in these trainings."
          actionsHeader={canManage ? "Action" : undefined}
          rowActions={canManage ? (r) => (
            <button type="button" onClick={() => onRecord(r.batch.id, r.studentId)} disabled={!r.expected.length} className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-bold text-ink hover:bg-page disabled:opacity-40">
              Record
            </button>
          ) : undefined}
        />
      )}
    </section>
  );
}
