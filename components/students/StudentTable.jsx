"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical, UserRound } from "lucide-react";
import DataTable, { StatusBadge } from "../data-table/DataTable";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}
const metric = (value) => (value == null ? "—" : `${value}%`);

// Approval / account state as one label, used for the badge, the filter and export.
export function studentStatus(item) {
  if (item.status === "pending") return "Pending";
  if (item.status === "rejected") return "Rejected";
  return item.active === false ? "Inactive" : "Active";
}
const STATUS_TONE = { Pending: "orange", Rejected: "red", Inactive: "gray", Active: "green" };

function initialsOf(name, email) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase() || "?";
}

function IdentityCell({ item }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-active text-xs font-bold text-primary">
        {initialsOf(item.displayName, item.email)}
      </span>
      <div className="min-w-0">
        <b className="block truncate text-ink">{item.displayName || "Unnamed student"}</b>
        <span className="block font-mono text-[11px] text-subtle">{item.userId || "—"}</span>
      </div>
    </div>
  );
}

function ContactCell({ item }) {
  return (
    <div className="min-w-0">
      <span className="block truncate text-xs text-ink">{item.email || "—"}</span>
      {item.phone && <span className="block text-[11px] text-muted">{item.phone}</span>}
    </div>
  );
}

function CoursesCell({ courseNames }) {
  const list = (courseNames || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length) return <span className="text-xs text-subtle">No enrollment</span>;
  const shown = list.slice(0, 2);
  const rest = list.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((name) => (
        <span key={name} className="rounded-full bg-info-soft px-2 py-0.5 text-[10px] font-bold text-info">{name}</span>
      ))}
      {rest > 0 && <span className="rounded-full bg-page px-2 py-0.5 text-[10px] font-bold text-muted">+{rest} more</span>}
    </div>
  );
}

function ProgressCell({ value }) {
  if (value == null) return <span className="text-xs text-subtle">—</span>;
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-page">
        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-ink">{pct}%</span>
    </div>
  );
}

// The three-dot secondary-actions menu. Approve/Reject for a pending
// registration stay on the dedicated Pending Registrations banner above the
// table (unchanged) — rows reaching this table are always Active/Inactive/
// Rejected, so this menu only ever needs Deactivate/Reactivate.
function RowMenu({ item, onDeactivate, onReactivate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onClick(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const status = studentStatus(item);
  if (status === "Rejected") return null;

  return (
    <div ref={ref} className="relative" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="More actions"
        className="rounded-lg p-1.5 text-muted hover:bg-page hover:text-ink"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-40 rounded-xl border border-border-subtle bg-card p-1 shadow-2xl">
          {status === "Active" ? (
            <button
              type="button"
              onClick={() => { setOpen(false); onDeactivate(item); }}
              className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-primary hover:bg-active"
            >
              Deactivate
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setOpen(false); onReactivate(item); }}
              className="block w-full rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-success hover:bg-success-soft"
            >
              Reactivate
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function EmptyState({ tab, onAdd }) {
  const copy = {
    "All Students": "No approved students yet. Add one, or approve a pending registration.",
    Active: "No active students right now.",
    Inactive: "No deactivated students — everyone approved is currently active.",
    Rejected: "No rejected registrations.",
  };
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border-subtle bg-card py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-page text-subtle">
        <UserRound className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-ink">{copy[tab] || "No students found."}</p>
      {tab !== "Rejected" && onAdd && (
        <button type="button" onClick={onAdd} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">
          + Add Student
        </button>
      )}
    </div>
  );
}

export default function StudentTable({ students, tab, onView, onEdit, onDeactivate, onReactivate, onAdd }) {
  const columns = [
    { key: "displayName", header: "Student", sortable: true, accessor: (r) => r.displayName || "", render: (r) => <IdentityCell item={r} /> },
    { key: "email", header: "Contact", sortable: true, accessor: (r) => r.email || "", render: (r) => <ContactCell item={r} /> },
    { key: "courseNames", header: "Enrolled Courses", accessor: (r) => r.courseNames || "", render: (r) => <CoursesCell courseNames={r.courseNames} /> },
    { key: "progress", header: "Progress", align: "right", sortable: true, sortValue: (r) => r.progress ?? -1, render: (r) => <ProgressCell value={r.progress} />, exportValue: (r) => metric(r.progress) },
    {
      key: "status", header: "Status", sortable: true, filter: {},
      accessor: (r) => studentStatus(r),
      render: (r) => <StatusBadge tone={STATUS_TONE[studentStatus(r)]}>{studentStatus(r)}</StatusBadge>,
    },
    { key: "createdAt", header: "Joined", sortable: true, sortValue: (r) => r.createdAt || "", exportValue: (r) => formatDate(r.createdAt), render: (r) => <span className="text-xs text-muted">{formatDate(r.createdAt) || "—"}</span> },
  ];

  if (!students.length) return <EmptyState tab={tab} onAdd={onAdd} />;

  return (
    <DataTable
      title="students"
      name="students"
      columns={columns}
      rows={students}
      initialSort={{ key: "createdAt", dir: "desc" }}
      pageSize={10}
      emptyLabel="No students match this view."
      rowActions={(item) => (
        <>
          <button type="button" onClick={() => onView(item)} className="rounded-lg bg-info px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90">View</button>
          <button type="button" onClick={() => onEdit(item)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-page">Edit</button>
          <RowMenu item={item} onDeactivate={onDeactivate} onReactivate={onReactivate} />
        </>
      )}
    />
  );
}
