"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleDollarSign, Clock, Hash, Wallet } from "lucide-react";
import { stopEnterSubmit } from "../../lib/ui/keyboard";
import { createIncome, deleteIncome as deleteIncomeRequest, updateIncome } from "../../lib/services/finance-service";
import { loadStudentDirectory } from "../../lib/services/student-service";
import { formatDate, formatMoney } from "../training/PaymentHistoryTable";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import StatCard from "./StatCard";
import DataTable from "../data-table/DataTable";

// Client-side mirrors of the server allowlists in lib/server/finance-core.js
// (kept in sync deliberately, same pattern as ExpensesTab). The server
// re-validates every value, so these only drive the UI. GENERAL academy
// income only — tuition (Course Fee etc.) belongs to the student Payments
// system and would double-count if logged here too.
const SOURCES = [
  "Donation",
  "Sponsorship",
  "Grant",
  "Event Income",
  "Workshop Income",
  "Room / Facility Rental",
  "Material / Book Sales",
  "Membership",
  "Other",
];
const METHODS = ["Cash", "Bank Transfer", "bKash", "Nagad", "Card", "Other"];
const STATUSES = ["Paid", "Pending"];

const today = () => new Date().toISOString().slice(0, 10);

function StatusBadge({ value }) {
  const paid = value !== "Pending";
  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${paid ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
      {paid ? "Paid" : "Pending"}
    </span>
  );
}

function Dialog({ title, children, close, wide }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className={`max-h-[88vh] w-full overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl ${wide ? "max-w-2xl" : "max-w-lg"}`}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-ink">{title}</h3>
          <button type="button" onClick={close} className="text-xl text-muted" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const LABEL = "grid gap-1 text-xs font-bold text-muted";
const FIELD = "rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary";

function IncomeForm({ initial, saving, onCancel, onSubmit, students, courses }) {
  const [form, setForm] = useState(
    initial || {
      date: today(), source: "", personId: "", personName: "", courseId: "", courseName: "", amount: "",
      paymentMethod: "Cash", reference: "", status: "Paid", description: "",
    },
  );
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  // Picking a real student/batch fills BOTH the id (so this income record
  // can actually be traced back to that student/training) and the display
  // name (so the table/receipt still read fine even if that student or
  // training is later renamed or removed) — the same id+name pairing
  // lib/server/finance-core.js already stores for personId/courseId.
  function selectStudent(event) {
    const id = event.target.value;
    const student = students.find((item) => item.id === id);
    setForm((current) => ({ ...current, personId: id, personName: student ? student.displayName || student.email || "" : current.personName }));
  }
  function selectCourse(event) {
    const id = event.target.value;
    const course = courses.find((item) => item.id === id);
    setForm((current) => ({ ...current, courseId: id, courseName: course ? course.title || "" : "" }));
  }

  const amountNum = form.amount === "" ? null : Number(form.amount);
  const amountError = amountNum !== null && (!Number.isFinite(amountNum) || amountNum <= 0) ? "Amount must be greater than zero." : null;

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    if (!form.date) return setError("Income date is required.");
    if (!form.source) return setError("Choose an income source.");
    if (amountNum === null || amountError) return setError(amountError || "Enter an amount.");
    if (!form.paymentMethod) return setError("Choose a payment method.");
    setError("");
    try {
      await onSubmit({ ...form, amount: amountNum });
    } catch (submitError) {
      setError(submitError.message || "Unable to save this income record.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* Required fields first, then optional — matches the Expenses form
          pattern. General academy income only; no student/enrollment/payment
          link is ever required. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Date <span className="text-primary">*</span>
          <input type="date" value={form.date} onChange={set("date")} required className={FIELD} />
        </label>
        <label className={LABEL}>
          Income Source <span className="text-primary">*</span>
          <select value={form.source} onChange={set("source")} required className={FIELD}>
            <option value="">Choose a source</option>
            {SOURCES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className={LABEL}>
          Amount <span className="text-primary">*</span>
          <span className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-subtle">S$</span>
            <input
              type="number" min="0" step="0.01" value={form.amount} onChange={set("amount")} onKeyDown={stopEnterSubmit} required
              className={`w-full rounded-xl border px-3 py-2.5 pl-9 text-sm outline-none focus:ring-2 focus:ring-primary ${amountError ? "border-primary" : "border-border-subtle"}`}
            />
          </span>
          {amountError && <span className="text-[11px] font-semibold text-primary">{amountError}</span>}
        </label>
        <label className={LABEL}>
          Payment Method <span className="text-primary">*</span>
          <select value={form.paymentMethod} onChange={set("paymentMethod")} required className={FIELD}>
            {METHODS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className={LABEL}>
          Status
          <select value={form.status} onChange={set("status")} className={FIELD}>
            {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className={LABEL}>
          Student <span className="font-normal text-subtle">(optional — for tracking which student this came from)</span>
          <select value={form.personId} onChange={selectStudent} className={FIELD}>
            <option value="">Not a specific student</option>
            {students.map((item) => <option key={item.id} value={item.id}>{item.displayName || item.email}</option>)}
          </select>
        </label>
        <label className={LABEL}>
          Person <span className="font-normal text-subtle">(optional — donor/sponsor name, or overrides the student above)</span>
          <input value={form.personName} onChange={set("personName")} onKeyDown={stopEnterSubmit} placeholder="e.g. donor / sponsor name" className={FIELD} />
        </label>
        <label className={LABEL}>
          Training / Batch <span className="font-normal text-subtle">(optional — for tracking which batch this came from)</span>
          <select value={form.courseId} onChange={selectCourse} className={FIELD}>
            <option value="">Not tied to a training</option>
            {courses.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label className={LABEL}>
          Reference / Transaction ID <span className="font-normal text-subtle">(optional)</span>
          <input value={form.reference} onChange={set("reference")} onKeyDown={stopEnterSubmit} className={FIELD} />
        </label>
      </div>
      <label className={LABEL}>
        Description / Note <span className="font-normal text-subtle">(optional)</span>
        <textarea value={form.description} onChange={set("description")} rows={2} maxLength={1000} className={FIELD} />
      </label>

      {error && <p className="rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 text-sm font-bold text-muted disabled:opacity-50">Cancel</button>
        <button disabled={saving || Boolean(amountError)} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {saving ? "Saving…" : initial ? "Save changes" : "Save Income"}
        </button>
      </div>
    </form>
  );
}

function ViewRow({ label, children }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border-subtle py-2.5 last:border-0">
      <dt className="text-xs font-bold uppercase tracking-wider text-subtle">{label}</dt>
      <dd className="text-right text-sm font-semibold text-ink">{children || "—"}</dd>
    </div>
  );
}

function IncomeView({ record, close }) {
  return (
    <Dialog title="Income record" close={close}>
      <dl>
        <ViewRow label="Date">{formatDate(record.date)}</ViewRow>
        <ViewRow label="Source">{record.source}</ViewRow>
        <ViewRow label="Person">{record.personName}</ViewRow>
        <ViewRow label="Training / Batch">{record.courseName}</ViewRow>
        <ViewRow label="Amount"><span className="text-success">{formatMoney(record.amount)}</span></ViewRow>
        <ViewRow label="Payment Method">{record.paymentMethod}</ViewRow>
        <ViewRow label="Reference">{record.reference}</ViewRow>
        <ViewRow label="Status"><StatusBadge value={record.status} /></ViewRow>
        <ViewRow label="Description">{record.description}</ViewRow>
        <ViewRow label="Created By">{record.recordedByName}</ViewRow>
        <ViewRow label="Created At">{record.createdAt ? formatDate(record.createdAt) : "—"}</ViewRow>
        <ViewRow label="Updated At">{record.updatedAt ? formatDate(record.updatedAt) : "—"}</ViewRow>
      </dl>
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={close} className="rounded-xl border border-border-subtle px-4 py-2 text-sm font-bold text-ink hover:bg-active">Close</button>
      </div>
    </Dialog>
  );
}

export default function IncomeManagementTab({ income, loading, onChanged }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);

  // For the Student / Training selects in the Add/Edit Income form — a
  // one-time self-fetch (same pattern as AssetsTab), not tied to the
  // overview's loading state above.
  useEffect(() => {
    loadStudentDirectory()
      .then((result) => { setStudents(result.students || []); setCourses(result.courses || []); })
      .catch(() => {});
  }, []);

  const dated = useMemo(
    () => income.filter((item) => (!fromDate || (item.date || "") >= fromDate) && (!toDate || (item.date || "") <= toDate)),
    [income, fromDate, toDate],
  );

  const summary = useMemo(() => {
    const total = dated.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const paid = dated.filter((item) => (item.status || "Paid") !== "Pending").reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    return { total, paid, pending: total - paid, count: dated.length };
  }, [dated]);

  const columns = useMemo(() => [
    { key: "date", header: "Date", sortable: true, accessor: (i) => i.date || "", render: (i) => <span className="whitespace-nowrap text-xs">{formatDate(i.date)}</span> },
    { key: "source", header: "Income Source", sortable: true, filter: {}, accessor: (i) => i.source || "", render: (i) => <b className="text-ink">{i.source}</b> },
    { key: "personName", header: "Person / Student", accessor: (i) => i.personName || "" },
    { key: "courseName", header: "Training / Batch", sortable: true, filter: {}, accessor: (i) => i.courseName || "" },
    { key: "amount", header: "Amount", align: "right", sortable: true, accessor: (i) => Number(i.amount || 0), render: (i) => <b className="whitespace-nowrap text-success">{formatMoney(i.amount)}</b>, exportValue: (i) => Number(i.amount || 0) },
    { key: "paymentMethod", header: "Method", sortable: true, filter: {}, accessor: (i) => i.paymentMethod || "" },
    { key: "status", header: "Status", sortable: true, filter: {}, accessor: (i) => i.status || "Paid", render: (i) => <StatusBadge value={i.status} /> },
    { key: "reference", header: "Reference / Txn ID", accessor: (i) => i.reference || "" },
    { key: "recordedByName", header: "Created By", sortable: true, accessor: (i) => i.recordedByName || "" },
  ], []);

  async function handleCreate(values) {
    setSaving(true);
    try {
      await createIncome(values);
      toast.success("Income record added successfully");
      setAdding(false);
      onChanged();
    } catch (error) {
      toast.error(error.message || "Failed to add income record");
      throw error;
    } finally {
      setSaving(false);
    }
  }
  async function handleUpdate(values) {
    setSaving(true);
    try {
      await updateIncome(editing.id, values);
      toast.success("Income record updated successfully");
      setEditing(null);
      onChanged();
    } catch (error) {
      toast.error(error.message || "Failed to update income record");
      throw error;
    } finally {
      setSaving(false);
    }
  }
  function handleDelete(record) {
    return confirm({
      title: "Delete income record",
      message: "Are you sure you want to delete this income record?",
      tone: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        await deleteIncomeRequest(record.id);
        toast.success("Income record deleted successfully");
        onChanged();
      },
    });
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Income" value={summary.total} format={formatMoney} icon={Wallet} iconBg="bg-success-soft" iconColor="text-success" valueColor="text-success" loading={loading} />
        <StatCard label="Paid Income" value={summary.paid} format={formatMoney} icon={CircleDollarSign} iconBg="bg-success-soft" iconColor="text-success" valueColor="text-success" loading={loading} />
        <StatCard label="Pending Income" value={summary.pending} format={formatMoney} icon={Clock} iconBg="bg-warning-soft" iconColor="text-warning" valueColor="text-warning" loading={loading} />
        <StatCard label="Number of Records" value={summary.count} icon={Hash} iconBg="bg-active" iconColor="text-primary" loading={loading} />
      </section>

      <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted">
            <span>Date range</span>
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 font-normal" />
            <span>–</span>
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 font-normal" />
            {(fromDate || toDate) && <button type="button" onClick={() => { setFromDate(""); setToDate(""); }} className="text-primary">clear</button>}
          </div>
          <button type="button" onClick={() => setAdding(true)} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white">
            + Add Income
          </button>
        </div>

        <DataTable
          title="income"
          name="income"
          columns={columns}
          rows={dated}
          loading={loading}
          initialSort={{ key: "date", dir: "desc" }}
          pageSize={10}
          emptyLabel="No income records found."
          rowActions={(item) => (
            <>
              <button type="button" onClick={() => setViewing(item)} className="rounded-lg bg-info px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90">View</button>
              <button type="button" onClick={() => setEditing(item)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-page">Edit</button>
              <button type="button" onClick={() => handleDelete(item)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-page">Delete</button>
            </>
          )}
        />
      </section>

      {adding && (
        <Dialog title="Add Income" close={() => !saving && setAdding(false)} wide>
          <IncomeForm saving={saving} onCancel={() => setAdding(false)} onSubmit={handleCreate} students={students} courses={courses} />
        </Dialog>
      )}
      {editing && (
        <Dialog title="Edit Income" close={() => !saving && setEditing(null)} wide>
          <IncomeForm
            initial={{
              date: editing.date || today(),
              source: editing.source || "",
              personId: editing.personId || "",
              personName: editing.personName || "",
              courseId: editing.courseId || "",
              courseName: editing.courseName || "",
              amount: editing.amount ?? "",
              paymentMethod: editing.paymentMethod || "Cash",
              reference: editing.reference || "",
              status: editing.status || "Paid",
              description: editing.description || "",
            }}
            saving={saving}
            onCancel={() => setEditing(null)}
            onSubmit={handleUpdate}
            students={students}
            courses={courses}
          />
        </Dialog>
      )}
      {viewing && <IncomeView record={viewing} close={() => setViewing(null)} />}
    </div>
  );
}
