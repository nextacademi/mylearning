"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Check, ChevronRight, FileCheck2, FilePen, LayoutGrid, Minus, Plus, Presentation, Search, Table2, UserCheck, Users, X,
} from "lucide-react";
import DataTable from "../data-table/DataTable";
import PersonPicker from "../ui/PersonPicker";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import { createStandardAssignments, loadAssignmentPortal, recordAssignmentSubmission } from "../../lib/services/assignment-portal-service";

// Assignment Portal — Admin/Director: every training batch with each
// student's status on its published assignments (Model Test → Assignment),
// a per-student "all modules completed" check, and recording a submission
// handed in outside the app. Data: /api/admin/assignment-portal.

const doneCount = (student) => student.expected.filter((id) => student.done[id]).length;
const completedAll = (student) => student.expected.length > 0 && doneCount(student) === student.expected.length;
const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const formatDate = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

function batchStats(batch) {
  const fully = batch.students.filter(completedAll).length;
  const owed = batch.students.reduce((sum, s) => sum + s.expected.length, 0);
  const submitted = batch.students.reduce((sum, s) => sum + doneCount(s), 0);
  return { fully, percent: percent(fully, batch.students.length), owed, submitted };
}

// Latest file link a student handed in for this batch.
function latestLink(student) {
  return Object.values(student.done)
    .filter((item) => item.link)
    .sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || ""))[0]?.link || "";
}

function ProgressBar({ value, className = "h-2" }) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-page ${className}`}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${value}%` }} />
    </div>
  );
}

function Tick({ item, owed }) {
  if (!owed) return <span className="text-xs text-subtle">n/a</span>;
  if (!item) {
    return <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border-subtle bg-page text-subtle" title="Not submitted"><Minus className="h-4 w-4" aria-label="Not submitted" /></span>;
  }
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-success/30 bg-success-soft text-success" title="Submitted"><Check className="h-4 w-4" aria-label="Submitted" /></span>
      {(item.score != null || item.late) && (
        <span className="text-[11px] font-semibold text-muted">{[item.score != null ? `${item.score} pts` : "", item.late ? "late" : ""].filter(Boolean).join(" · ")}</span>
      )}
    </span>
  );
}

function Modal({ title, subtitle, children, onClose }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3 border-b border-border-subtle pb-4">
          <div>
            <h3 className="text-xl font-black text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-page hover:text-ink" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const FIELD = "w-full rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-primary";
const asPerson = (student) => ({ id: student.studentId, displayName: student.name, email: student.email, phone: student.phone, userId: student.userId });

// Record a submission for a student (Submit / Upload Assignment).
function SubmitModal({ batches, initial, onClose, onSaved }) {
  const toast = useToast();
  const withAssignments = batches.filter((batch) => batch.assignments.length);
  const [batchId, setBatchId] = useState(initial?.batchId || withAssignments[0]?.id || "");
  const [studentId, setStudentId] = useState(initial?.studentId || "");
  const [assignmentId, setAssignmentId] = useState("");
  const [link, setLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const batch = withAssignments.find((item) => item.id === batchId);
  const people = (batch?.students || []).map(asPerson);
  const student = batch?.students.find((item) => item.studentId === studentId);
  const owed = batch && student ? batch.assignments.filter((item) => student.expected.includes(item.id)) : [];
  // Default to the first one still missing.
  const chosen = owed.some((item) => item.id === assignmentId) ? assignmentId : (owed.find((item) => !student.done[item.id]) || owed[0])?.id || "";

  async function submit(event) {
    event.preventDefault();
    if (!chosen || !studentId) return;
    setSaving(true);
    setError("");
    try {
      await recordAssignmentSubmission({ assignmentId: chosen, studentId, link });
      toast.success(`Submission recorded for ${student?.name || "the student"}.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(err.message || "Unable to record the submission.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Submit / Upload Assignment" subtitle="Record work a student handed in — on paper, by email or WhatsApp." onClose={onClose}>
      {!withAssignments.length ? (
        <p className="rounded-xl bg-page p-4 text-sm text-muted">No training has a published assignment yet. Create one in Model Test → Assignment first.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            Training batch
            <select value={batchId} onChange={(e) => { setBatchId(e.target.value); setStudentId(""); setAssignmentId(""); }} className={`${FIELD} normal-case tracking-normal`}>
              {withAssignments.map((item) => <option key={item.id} value={item.id}>{item.courseCode} — {item.title}</option>)}
            </select>
          </label>
          <div className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            Student
            <PersonPicker
              people={people}
              value={studentId}
              onChange={(id) => { setStudentId(id); setAssignmentId(""); }}
              placeholder="Type a name, email or user ID"
              noneLabel="Choose a student"
              noMatchLabel="No student matches"
              ariaLabel="student"
              required
              className={`${FIELD} normal-case tracking-normal`}
            />
          </div>
          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            Assignment
            <select value={chosen} onChange={(e) => setAssignmentId(e.target.value)} disabled={!owed.length} className={`${FIELD} normal-case tracking-normal disabled:opacity-60`}>
              {!student && <option value="">Choose a student first</option>}
              {student && !owed.length && <option value="">No assignment is set for this student</option>}
              {owed.map((item, index) => (
                <option key={item.id} value={item.id}>
                  {`Assignment ${batch.assignments.indexOf(item) + 1 || index + 1}: ${item.title}${student.done[item.id] ? " (already submitted)" : ""}`}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
            File link (optional)
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/file/d/..." className={`${FIELD} normal-case tracking-normal`} />
          </label>
          {error && <p className="rounded-xl bg-active p-3 text-sm text-primary">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-bold text-ink hover:bg-page">Cancel</button>
            <button type="submit" disabled={saving || !chosen} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40">{saving ? "Saving…" : "Submit Assignment"}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// "Check All Modules Completed" — one student across every batch they're in.
function CompletionModal({ batches, onClose }) {
  const people = useMemo(() => {
    const map = new Map();
    batches.forEach((batch) => batch.students.forEach((student) => { if (!map.has(student.studentId)) map.set(student.studentId, asPerson(student)); }));
    return [...map.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [batches]);
  const [studentId, setStudentId] = useState("");
  const enrolled = batches
    .map((batch) => ({ batch, student: batch.students.find((item) => item.studentId === studentId) }))
    .filter((item) => item.student);
  const owedTotal = enrolled.reduce((sum, { student }) => sum + student.expected.length, 0);
  const doneTotal = enrolled.reduce((sum, { student }) => sum + doneCount(student), 0);

  return (
    <Modal title="Student Full Module Completion Tracker" subtitle="Check whether a student has submitted every assignment in all their trainings." onClose={onClose}>
      <div className="grid gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        Select student
        <PersonPicker
          people={people}
          value={studentId}
          onChange={setStudentId}
          placeholder="Type a name, email or user ID"
          noneLabel="Choose a student"
          noMatchLabel="No student matches"
          ariaLabel="student"
          className={`${FIELD} normal-case tracking-normal`}
        />
      </div>
      {!studentId ? (
        <p className="mt-4 rounded-xl bg-page p-4 text-sm text-muted">Choose a student to see their full completion report.</p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-page p-4">
            <span className="text-sm text-muted"><b className="text-ink">{doneTotal} of {owedTotal}</b> assignments submitted across {enrolled.length} training{enrolled.length === 1 ? "" : "s"}</span>
            {owedTotal > 0 && doneTotal === owedTotal ? (
              <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-bold text-success">All Modules Completed</span>
            ) : (
              <span className="rounded-full bg-warning-soft px-3 py-1 text-xs font-bold text-warning">{owedTotal ? "In Progress" : "No assignments yet"}</span>
            )}
          </div>
          {enrolled.map(({ batch, student }) => {
            const owed = batch.assignments.filter((item) => student.expected.includes(item.id));
            const link = latestLink(student);
            return (
              <div key={batch.id} className="rounded-xl border border-border-subtle p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-primary">{batch.courseCode}</p>
                    <h4 className="font-bold text-ink">{batch.title}</h4>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${completedAll(student) ? "bg-success-soft text-success" : "bg-page text-muted"}`}>
                    {owed.length ? `${doneCount(student)}/${owed.length} submitted` : "No assignments"}
                  </span>
                </div>
                {owed.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {owed.map((item) => (
                      <div key={item.id} className="rounded-lg border border-border-subtle bg-card p-2.5 text-center">
                        <span className="block truncate text-[11px] font-bold uppercase text-subtle" title={item.title}>Assign {batch.assignments.indexOf(item) + 1}</span>
                        <span className="mt-1 inline-flex"><Tick item={student.done[item.id]} owed /></span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 flex items-center justify-between text-sm text-muted">
                  <span>Submitted file:</span>
                  {link ? <a href={link} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">Open submission</a> : <span className="text-subtle">None</span>}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function StatCard({ label, value, badge, icon: Icon, tone, children }) {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-border-subtle bg-card p-6 shadow-sm">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-muted">{label}</span>
          <span className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
        </div>
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="text-3xl font-black text-ink">{value}</p>
          {badge}
        </div>
      </div>
      <div className="mt-4 border-t border-border-subtle pt-4">{children}</div>
    </div>
  );
}

function BatchCard({ batch, onOpen }) {
  const stats = batchStats(batch);
  return (
    <button type="button" onClick={onOpen} className="group flex flex-col justify-between rounded-2xl border border-border-subtle bg-card p-5 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md">
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="rounded-full bg-active px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">{batch.courseCode}</span>
          <span className="flex items-center gap-1 text-xs text-muted"><Users className="h-3.5 w-3.5" aria-hidden="true" />{batch.students.length} Students</span>
        </div>
        <h4 className="mb-1 text-base font-bold text-ink group-hover:text-primary">{batch.title}</h4>
        <p className="mb-4 text-xs text-muted">Instructor: {batch.teacherName || "Not assigned"}</p>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs font-semibold text-muted">
          <span>Fully Completed</span>
          <span className="font-bold text-ink">{stats.percent}%</span>
        </div>
        <ProgressBar value={stats.percent} />
        <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-3 text-xs text-muted">
          <span className="flex items-center gap-1"><FilePen className="h-3.5 w-3.5 text-primary" aria-hidden="true" />{batch.assignments.length ? `Assignments 1-${batch.assignments.length}` : "No assignments"}</span>
          <span className="flex items-center font-bold text-primary">View Submissions <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></span>
        </div>
      </div>
    </button>
  );
}

function BatchDetail({ batch, onBack, onRecord, onCheck, onAddAssignment, onChanged }) {
  const stats = batchStats(batch);
  const confirm = useConfirm();
  const toast = useToast();

  function setUpStandard() {
    return confirm({
      title: "Create Assignment 1–4",
      message: `Create and publish Assignment 1 (Fundamentals), 2 (Intermediate), 3 (Advanced Project) and 4 (Capstone Submission) for ${batch.title}? Enrolled students will see them and can submit. You can edit or unpublish them later in Model Test → Assignment.`,
      tone: "success",
      confirmLabel: "Create",
      onConfirm: async () => {
        await createStandardAssignments(batch.id);
        toast.success("Assignment 1–4 created.");
        onChanged();
      },
    });
  }
  const columns = [
    { key: "userId", header: "User ID", sortable: true, accessor: (s) => s.userId || "", render: (s) => <span className="font-mono text-xs font-semibold text-muted">{s.userId || "—"}</span> },
    { key: "name", header: "Student", sortable: true, accessor: (s) => s.name, sortValue: (s) => `${s.name} ${s.email}`, render: (s) => <span><b className="block text-ink">{s.name}</b><span className="text-xs text-muted">{s.email}</span></span> },
    ...batch.assignments.map((item, index) => ({
      key: `a_${item.id}`,
      header: `Assignment ${index + 1}`,
      align: "center",
      sortable: true,
      searchable: false,
      accessor: (s) => (s.done[item.id] ? 1 : 0),
      exportValue: (s) => (!s.expected.includes(item.id) ? "Not set" : s.done[item.id] ? "Submitted" : "Missing"),
      render: (s) => <Tick item={s.done[item.id]} owed={s.expected.includes(item.id)} />,
    })),
    {
      key: "file", header: "File Link", align: "center", searchable: false, accessor: latestLink,
      render: (s) => {
        const link = latestLink(s);
        return link
          ? <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-active px-3 py-1.5 text-xs font-bold text-primary hover:opacity-90"><FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />View File</a>
          : <span className="text-xs italic text-subtle">No file</span>;
      },
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-2 rounded-xl bg-active px-4 py-2 text-sm font-bold text-primary hover:opacity-90">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Training Batches
        </button>
        <button type="button" onClick={onCheck} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800">
          <UserCheck className="h-4 w-4 text-red-300" aria-hidden="true" /> Check All Modules Completed
        </button>
      </div>

      <section className="flex flex-col justify-between gap-4 rounded-2xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 md:flex-row md:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">{batch.courseCode}{batch.category ? ` · ${batch.category}` : ""}</p>
          <h2 className="mt-1 text-2xl font-black text-ink">{batch.title}</h2>
          <p className="mt-1 text-sm text-muted">Instructor: {batch.teacherName || "Not assigned"} · {batch.assignments.length} published assignment{batch.assignments.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-[#f3aaaa] bg-white p-3 shadow-sm">
          <div className="border-r border-slate-200 px-3 text-center">
            <span className="block text-xs text-slate-500">Total Enrolled</span>
            <span className="text-xl font-black text-slate-900">{batch.students.length}</span>
          </div>
          <div className="px-3 text-center">
            <span className="block text-xs text-slate-500">All Completed</span>
            <span className="text-xl font-black text-emerald-600">{stats.fully}</span>
          </div>
        </div>
      </section>

      {batch.assignments.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {batch.assignments.map((item, index) => (
            <span key={item.id} className="rounded-full border border-border-subtle bg-card px-3 py-1 text-muted">
              <b className="text-ink">Assignment {index + 1}:</b> {item.title}{item.dueDate ? ` · due ${formatDate(item.dueDate)}` : ""}
            </span>
          ))}
        </div>
      )}

      <section className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
        <h3 className="mb-4 text-lg font-bold text-ink">Student Assignment Submissions Status</h3>
        {batch.assignments.length ? (
          <DataTable
            title="students"
            name={`assignments-${batch.courseCode}`}
            columns={columns}
            rows={batch.students}
            getRowId={(s) => s.studentId}
            initialSort={{ key: "name", dir: "asc" }}
            pageSize={20}
            emptyLabel="No students enrolled yet."
            actionsHeader="Action"
            rowActions={(s) => (
              <button type="button" onClick={() => onRecord(s.studentId)} disabled={!s.expected.length} className="rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-bold text-ink hover:bg-page disabled:opacity-40">
                Record Submission
              </button>
            )}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-border-subtle p-8 text-center">
            <p className="text-sm text-muted">This training has no published assignment yet.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={setUpStandard} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-hover">
                <Plus className="h-4 w-4" aria-hidden="true" /> Create Assignment 1–4
              </button>
              <button type="button" onClick={onAddAssignment} className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-bold text-ink hover:bg-page">Make my own in Model Test</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export default function AssignmentPortal({ onNavigate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("cards");
  const [openId, setOpenId] = useState("");
  const [submitFor, setSubmitFor] = useState(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(() => {
    loadAssignmentPortal()
      .then((result) => { setData(result); setError(""); })
      .catch((err) => setError(err.message || "Unable to load assignments."));
  }, []);
  useEffect(() => { load(); }, [load]);

  const batches = useMemo(() => data?.batches || [], [data]);
  const totals = useMemo(() => {
    const students = new Map();
    batches.forEach((batch) => batch.students.forEach((s) => {
      const prev = students.get(s.studentId) || { owed: 0, done: 0 };
      students.set(s.studentId, { owed: prev.owed + s.expected.length, done: prev.done + doneCount(s) });
    }));
    const owing = [...students.values()].filter((s) => s.owed);
    const owed = owing.reduce((sum, s) => sum + s.owed, 0);
    const submitted = owing.reduce((sum, s) => sum + s.done, 0);
    return {
      students: students.size,
      engagement: percent(owing.filter((s) => s.done).length, owing.length),
      active: batches.filter((b) => b.status === "Active").length,
      submitted,
      rate: percent(submitted, owed),
      biggest: [...batches].sort((a, b) => b.students.length - a.students.length).slice(0, 6),
    };
  }, [batches]);

  const q = search.trim().toLowerCase();
  const shown = q ? batches.filter((b) => [b.courseCode, b.title, b.category, b.teacherName].some((v) => String(v || "").toLowerCase().includes(q))) : batches;
  const openBatch = batches.find((b) => b.id === openId);

  function addAssignment() {
    // Open Model Test straight on its Assignment tab (components/exams/TeacherExams.jsx).
    try { window.sessionStorage.setItem("tab:model-test", "Assignment"); } catch { /* opens on its default tab */ }
    onNavigate?.("Model Test");
  }

  const tableColumns = [
    { key: "title", header: "Batch", sortable: true, accessor: (b) => `${b.courseCode} ${b.title}`, render: (b) => <span><b className="block text-xs text-primary">{b.courseCode}</b><span className="font-semibold text-ink">{b.title}</span></span> },
    { key: "teacherName", header: "Instructor", sortable: true, accessor: (b) => b.teacherName || "" },
    { key: "students", header: "Enrolled", align: "right", sortable: true, accessor: (b) => b.students.length },
    { key: "assignments", header: "Assignments", align: "right", sortable: true, accessor: (b) => b.assignments.length },
    { key: "progress", header: "Fully Completed", sortable: true, accessor: (b) => batchStats(b).percent, exportValue: (b) => `${batchStats(b).percent}%`, render: (b) => <span className="flex items-center gap-3"><span className="w-28"><ProgressBar value={batchStats(b).percent} /></span><b className="text-xs text-ink">{batchStats(b).percent}%</b></span> },
  ];

  if (error) return <p className="rounded-2xl bg-active p-4 text-sm text-primary">{error}</p>;

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 shadow-sm">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Organization overview</p>
          <h2 className="mt-1 text-3xl font-black text-ink">{openBatch ? `${openBatch.title} — Assignments` : "Assignment Portal"}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSubmitFor({ batchId: openBatch?.id })} className="rounded-xl border border-border-subtle bg-card px-4 py-3 text-sm font-bold text-ink hover:bg-page">Submit / Upload Assignment</button>
          <button type="button" onClick={addAssignment} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white hover:bg-primary-hover"><Plus className="h-4 w-4" aria-hidden="true" /> Add Assignment</button>
        </div>
      </section>

      {!data ? (
        <div className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-card" />)}</div>
      ) : openBatch ? (
        <BatchDetail
          batch={openBatch}
          onBack={() => setOpenId("")}
          onRecord={(studentId) => setSubmitFor({ batchId: openBatch.id, studentId })}
          onCheck={() => setChecking(true)}
          onAddAssignment={addAssignment}
          onChanged={load}
        />
      ) : (
        <>
          <section className="grid gap-5 lg:grid-cols-3">
            <StatCard label="Total Active Students" value={totals.students} icon={Users} tone="bg-active text-primary">
              <div className="mb-1 flex justify-between text-xs text-muted"><span>Submission engagement</span><b className="text-ink">{totals.engagement}% active</b></div>
              <ProgressBar value={totals.engagement} />
            </StatCard>
            <StatCard
              label="Training Batches"
              value={`${batches.length} Batches`}
              icon={Presentation}
              tone="bg-warning-soft text-warning"
              badge={<span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning">{totals.active} active</span>}
            >
              <div className="flex h-10 items-end gap-1.5" aria-label="Students per batch">
                {totals.biggest.map((b) => (
                  <span key={b.id} title={`${b.title}: ${b.students.length} students`} className="flex-1 rounded-t bg-primary/30" style={{ height: `${Math.max(12, percent(b.students.length, totals.biggest[0]?.students.length || 1))}%` }} />
                ))}
              </div>
            </StatCard>
            <StatCard
              label="Assignments Submitted"
              value={totals.submitted}
              icon={FileCheck2}
              tone="bg-success-soft text-success"
              badge={<span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-bold text-success">{totals.rate}% rate</span>}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">Of every assignment students owe</span>
                <span className="grid h-12 w-12 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-primary) ${totals.rate * 3.6}deg, var(--color-page, #f3f4f6) 0deg)` }}>
                  <span className="h-8 w-8 rounded-full bg-card" />
                </span>
              </div>
            </StatCard>
          </section>

          <section className="rounded-2xl border border-border-subtle bg-card p-6 shadow-sm">
            <div className="flex flex-col justify-between gap-4 border-b border-border-subtle pb-5 md:flex-row md:items-center">
              <div>
                <h3 className="text-lg font-bold text-ink">Training Batches &amp; Assignment Progress</h3>
                <p className="text-sm text-muted">Open a batch to see each student&apos;s assignment submissions.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="relative w-64 max-w-full">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search training batch…" className="w-full rounded-xl border border-border-subtle bg-page py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary" />
                </label>
                <div className="inline-flex overflow-hidden rounded-xl border border-border-subtle">
                  <button type="button" onClick={() => setView("cards")} className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold ${view === "cards" ? "bg-ink text-card" : "bg-card text-muted"}`}><LayoutGrid className="h-3.5 w-3.5" /> Cards</button>
                  <button type="button" onClick={() => setView("table")} className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold ${view === "table" ? "bg-ink text-card" : "bg-card text-muted"}`}><Table2 className="h-3.5 w-3.5" /> Table</button>
                </div>
              </div>
            </div>
            {!shown.length ? (
              <p className="py-10 text-center text-sm text-muted">{q ? "No training batch matches your search." : "No training batches with students or assignments yet."}</p>
            ) : view === "cards" ? (
              <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {shown.map((batch) => <BatchCard key={batch.id} batch={batch} onOpen={() => setOpenId(batch.id)} />)}
              </div>
            ) : (
              <div className="mt-5">
                <DataTable title="training batches" name="assignment-batches" columns={tableColumns} rows={shown} initialSort={{ key: "title", dir: "desc" }} pageSize={10} onRowClick={(b) => setOpenId(b.id)} rowActions={(b) => <button type="button" onClick={(e) => { e.stopPropagation(); setOpenId(b.id); }} className="rounded-lg bg-active px-3 py-1.5 text-xs font-bold text-primary">View Details</button>} />
              </div>
            )}
          </section>
        </>
      )}

      {submitFor && <SubmitModal batches={batches} initial={submitFor} onClose={() => setSubmitFor(null)} onSaved={load} />}
      {checking && <CompletionModal batches={batches} onClose={() => setChecking(false)} />}
    </div>
  );
}
