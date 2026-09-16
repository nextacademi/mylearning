"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Wallet, CircleDollarSign, Receipt as ReceiptIcon } from "lucide-react";
import StatCard from "./StatCard";
import DataTable, { StatusBadge } from "../data-table/DataTable";
import { formatDate, formatMoney } from "../training/PaymentHistoryTable";
import {
  cancelInvoice,
  createInvoice,
  downloadManualInvoicePdf,
  loadInvoicesCached,
  recordInvoicePayment,
  updateInvoice,
} from "../../lib/services/invoice-service";
import { downloadInvoicePdf } from "../../lib/services/finance-service";
import { collectPayment } from "../../lib/services/payment-service";
import { loadStudentDirectoryCached } from "../../lib/services/student-service";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import { SkeletonList } from "../ui/Skeleton";

// Client mirror of the server allowlists (lib/server/invoice-core.js /
// payment-core.js) — same pattern as every other Finance tab's SOURCES/
// METHODS constants. Server re-validates everything.
const INVOICE_TYPES = ["Registration Fee", "Material Fee", "Exam Fee", "Other"];
const PAYMENT_METHODS = ["Cash", "Bank Transfer", "bKash", "Rocket", "Card", "Other"];

const statusTone = { Unpaid: "orange", Partial: "purple", Paid: "green", Cancelled: "gray" };
function InvoiceStatusBadge({ row }) {
  const overdue = row.status !== "Cancelled" && row.status !== "Paid" && row.dueDate && row.dueDate < new Date().toISOString().slice(0, 10);
  return (
    <span className="inline-flex items-center gap-1">
      <StatusBadge tone={statusTone[row.status] || "gray"}>{row.status?.toUpperCase() || "UNPAID"}</StatusBadge>
      {overdue && <StatusBadge tone="red">OVERDUE</StatusBadge>}
    </span>
  );
}

const studentLabel = (s) => `${s.displayName || s.email || "Unnamed student"}${s.role === "Guest" ? " (Guest)" : ""}`;

// Same single-input combobox pattern proven in AchievementManagement.jsx's
// StudentCombobox — kept as its own small copy here rather than a shared
// import, since extracting it is a bigger refactor than this task calls for.
function StudentPicker({ students, loading, selected, onSelect }) {
  const [query, setQuery] = useState(selected ? studentLabel(selected) : "");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = !q ? students : students.filter((s) => (s.displayName || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q));
    return pool.slice(0, 50);
  }, [students, query]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={loading ? "Loading students…" : "Search by student name or email…"}
        disabled={loading}
        className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal disabled:opacity-60"
      />
      {selected && <p className="mt-1 text-[11px] font-normal text-success">Selected: {studentLabel(selected)}</p>}
      {open && !loading && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border-subtle bg-card p-1 shadow-xl">
          {filtered.length ? (
            filtered.map((s) => (
              <button
                type="button"
                key={s.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setQuery(studentLabel(s)); onSelect(s); setOpen(false); }}
                className={`block w-full rounded-lg px-3 py-2 text-left text-xs font-normal hover:bg-active ${selected?.id === s.id ? "bg-active font-bold text-ink" : "text-ink"}`}
              >
                <span className="block">{studentLabel(s)}</span>
                {s.email && <span className="block text-[11px] text-subtle">{s.email}</span>}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-subtle">No students found.</p>
          )}
        </div>
      )}
    </div>
  );
}

async function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

const blankInvoice = { studentId: "", invoiceType: INVOICE_TYPES[0], courseId: "", description: "", amount: "", discount: "0", dueDate: "", notes: "" };
const blankPayment = { amount: "", paymentMethod: "Cash", paymentDate: new Date().toISOString().slice(0, 10), reference: "", notes: "" };

export default function InvoicesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(({ force = false } = {}) => {
    setLoading(true);
    loadInvoicesCached({ force })
      .then((result) => {
        setInvoices(result.invoices || []);
        setError("");
      })
      .catch((err) => setError(err.message || "Unable to load invoices."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  useEffect(() => {
    loadStudentDirectoryCached()
      .then(({ students: s, courses: c }) => {
        setStudents(s || []);
        setCourses(c || []);
      })
      .catch(() => {})
      .finally(() => setStudentsLoading(false));
  }, []);

  const dated = useMemo(
    () => invoices.filter((item) => (!fromDate || (item.issueDate || "") >= fromDate) && (!toDate || (item.issueDate || "") <= toDate)),
    [invoices, fromDate, toDate],
  );

  const stats = useMemo(() => {
    const active = dated.filter((item) => item.status !== "Cancelled");
    return {
      totalInvoiced: active.reduce((sum, item) => sum + (Number(item.totalAmount) || 0), 0),
      totalPaid: dated.reduce((sum, item) => sum + (Number(item.paidAmount) || 0), 0),
      totalOutstanding: active.reduce((sum, item) => sum + (Number(item.dueAmount) || 0), 0),
      totalInvoices: dated.length,
    };
  }, [dated]);

  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(blankInvoice);
  const [createStudent, setCreateStudent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [editingRow, setEditingRow] = useState(null);
  const [editForm, setEditForm] = useState(blankInvoice);

  const [viewingRow, setViewingRow] = useState(null);
  const [payingRow, setPayingRow] = useState(null);
  const [paymentForm, setPaymentForm] = useState(blankPayment);
  const [busyId, setBusyId] = useState("");

  function openCreate() {
    setCreating(true);
    setCreateForm(blankInvoice);
    setCreateStudent(null);
    setMessage("");
  }
  function openEdit(row) {
    setEditingRow(row);
    setEditForm({
      studentId: row.studentId,
      invoiceType: row.invoiceType,
      courseId: row.courseId || "",
      description: row.description || "",
      amount: String(row.subtotal),
      discount: String(row.discount || 0),
      dueDate: row.dueDate || "",
      notes: row.notes || "",
    });
    setMessage("");
  }

  async function submitCreate() {
    if (!createStudent || !createForm.description.trim() || !createForm.amount) return;
    setSaving(true);
    setMessage("");
    try {
      await createInvoice({ ...createForm, studentId: createStudent.id });
      toast.success("Invoice created successfully");
      setCreating(false);
      load({ force: true });
    } catch (error) {
      setMessage(error.message || "Unable to create the invoice.");
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit() {
    if (!editForm.description.trim() || !editForm.amount) return;
    setSaving(true);
    setMessage("");
    try {
      await updateInvoice(editingRow.id, editForm);
      toast.success("Invoice updated successfully");
      setEditingRow(null);
      load({ force: true });
    } catch (error) {
      setMessage(error.message || "Unable to update the invoice.");
    } finally {
      setSaving(false);
    }
  }

  function cancel(row) {
    return confirm({
      title: "Cancel invoice",
      message: `Cancel invoice ${row.invoiceNumber}? It stays on record as cancelled and cannot be undone from here.`,
      tone: "danger",
      confirmLabel: "Cancel Invoice",
      onConfirm: async () => {
        setBusyId(row.id);
        try {
          await cancelInvoice(row.id);
          toast.success("Invoice cancelled successfully");
          load({ force: true });
        } catch (error) {
          toast.error(error.message || "Unable to cancel this invoice.");
        } finally {
          setBusyId("");
        }
      },
    });
  }

  function openPayment(row) {
    setPayingRow(row);
    setPaymentForm({ ...blankPayment, amount: String(row.dueAmount) });
  }
  async function submitPayment() {
    if (!payingRow) return;
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setSaving(true);
    setMessage("");
    try {
      if (payingRow.kind === "enrollment") {
        await collectPayment(payingRow.courseId, payingRow.studentId, paymentForm);
      } else {
        await recordInvoicePayment(payingRow.id, paymentForm);
      }
      toast.success("Payment recorded successfully");
      setPayingRow(null);
      setViewingRow(null);
      load({ force: true });
    } catch (error) {
      setMessage(error.message || "Unable to record this payment.");
    } finally {
      setSaving(false);
    }
  }

  const [openingId, setOpeningId] = useState("");
  async function pdfBlobFor(row) {
    return row.kind === "enrollment" ? downloadInvoicePdf(row.enrollmentId) : downloadManualInvoicePdf(row.id);
  }
  async function viewPdf(row) {
    setOpeningId(row.id);
    try {
      const blob = await pdfBlobFor(row);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      toast.error(error.message || "Unable to open this invoice.");
    } finally {
      setOpeningId("");
    }
  }
  async function downloadPdf(row) {
    setOpeningId(row.id);
    try {
      const blob = await pdfBlobFor(row);
      await triggerDownload(blob, `${row.invoiceNumber}.pdf`);
    } catch (error) {
      toast.error(error.message || "Unable to download this invoice.");
    } finally {
      setOpeningId("");
    }
  }

  const columns = useMemo(() => [
    { key: "issueDate", header: "Date", sortable: true, accessor: (r) => r.issueDate || "", render: (r) => <span className="whitespace-nowrap text-xs">{formatDate(r.issueDate)}</span> },
    { key: "invoiceNumber", header: "Invoice Number", sortable: true, accessor: (r) => r.invoiceNumber || "", render: (r) => <span className="font-mono text-xs text-muted">{r.invoiceNumber}</span> },
    {
      key: "studentName",
      header: "Student",
      sortable: true,
      filter: {
        options: (rows) => [...new Set(rows.map((r) => r.studentName).filter(Boolean))].sort().map((name) => ({ value: name, label: name })),
        predicate: (row, value) => row.studentName === value,
        placeholder: "All Students",
      },
      accessor: (r) => `${r.studentName || ""} ${r.studentUserId || ""}`,
      render: (r) => <span><b className="block text-ink">{r.studentName}</b><span className="text-[11px] text-muted">{r.studentUserId}</span></span>,
      exportValue: (r) => r.studentName || "",
    },
    {
      key: "description",
      header: "Course / Description",
      sortable: true,
      // DataTable's filter.options function must return {value,label}
      // objects (it uses them as-is, no normalization) — returning raw
      // strings here caused every <option> to share key={undefined}.
      // predicate filters by invoiceType (Type dropdown), not by this
      // column's own accessor text (course/description), since that's the
      // toolbar's actual "Invoice Type" filter, just attached to this
      // column per DataTable's one-filter-per-column model.
      filter: {
        options: (rows) => [...new Set(rows.map((r) => r.invoiceType).filter(Boolean))].sort().map((type) => ({ value: type, label: type })),
        predicate: (row, value) => row.invoiceType === value,
        placeholder: "All Types",
      },
      accessor: (r) => r.courseName || r.description || "",
      render: (r) => <span><b className="block text-ink">{r.courseName || r.description}</b><span className="text-[11px] text-muted">{r.invoiceType}</span></span>,
    },
    { key: "totalAmount", header: "Total", align: "right", sortable: true, accessor: (r) => Number(r.totalAmount || 0), render: (r) => <b className="text-ink">{formatMoney(r.totalAmount)}</b>, exportValue: (r) => Number(r.totalAmount || 0) },
    { key: "paidAmount", header: "Paid", align: "right", sortable: true, accessor: (r) => Number(r.paidAmount || 0), render: (r) => <b className="text-success">{formatMoney(r.paidAmount)}</b>, exportValue: (r) => Number(r.paidAmount || 0) },
    { key: "dueAmount", header: "Due", align: "right", sortable: true, accessor: (r) => Number(r.dueAmount || 0), render: (r) => <b className="text-primary">{formatMoney(r.dueAmount)}</b>, exportValue: (r) => Number(r.dueAmount || 0) },
    { key: "status", header: "Status", sortable: true, filter: {}, accessor: (r) => r.status || "Unpaid", render: (r) => <InvoiceStatusBadge row={r} /> },
  ], []);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Invoiced" value={stats.totalInvoiced} format={formatMoney} icon={FileText} iconBg="bg-active" iconColor="text-primary" loading={loading} />
        <StatCard label="Total Paid" value={stats.totalPaid} format={formatMoney} icon={Wallet} iconBg="bg-success-soft" iconColor="text-success" valueColor="text-success" loading={loading} />
        <StatCard label="Total Outstanding" value={stats.totalOutstanding} format={formatMoney} icon={CircleDollarSign} iconBg="bg-warning-soft" iconColor="text-warning" valueColor="text-warning" loading={loading} />
        <StatCard label="Total Invoices" value={stats.totalInvoices} icon={ReceiptIcon} iconBg="bg-active" iconColor="text-primary" loading={loading} />
      </section>

      <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
        {error && <p className="mb-3 rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted">
            <span>Date range</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 font-normal" />
            <span>–</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 font-normal" />
            {(fromDate || toDate) && <button type="button" onClick={() => { setFromDate(""); setToDate(""); }} className="text-primary">clear</button>}
          </div>
          <button type="button" onClick={openCreate} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white">+ Create Invoice</button>
        </div>

        {loading ? (
          <SkeletonList count={8} />
        ) : (
          <DataTable
            title="invoices"
            name="invoices"
            columns={columns}
            rows={dated}
            initialSort={{ key: "issueDate", dir: "desc" }}
            pageSize={10}
            emptyLabel="No invoices yet."
            rowActions={(row) => (
              <>
                <button type="button" onClick={() => setViewingRow(row)} className="rounded-lg bg-info px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90">View</button>
                {row.status !== "Cancelled" && row.dueAmount > 0 && (
                  <button type="button" onClick={() => openPayment(row)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-success hover:bg-page">Record Payment</button>
                )}
                <button type="button" disabled={openingId === row.id} onClick={() => downloadPdf(row)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-page disabled:opacity-50">Download</button>
                {row.kind === "manual" && row.status === "Unpaid" && (
                  <button type="button" onClick={() => openEdit(row)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-page">Edit</button>
                )}
                {row.kind === "manual" && row.status !== "Cancelled" && row.paidAmount === 0 && (
                  <button type="button" disabled={busyId === row.id} onClick={() => cancel(row)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-page disabled:opacity-50">Cancel</button>
                )}
              </>
            )}
          />
        )}
      </section>

      {/* Create Invoice */}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8">
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-card p-6 shadow-xl">
            <h4 className="text-sm font-bold text-ink">Create Manual Invoice</h4>
            <div className="grid gap-1 text-xs font-bold text-muted">
              Student
              <StudentPicker students={students} loading={studentsLoading} selected={createStudent} onSelect={setCreateStudent} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs font-bold text-muted">
                Invoice Type
                <select value={createForm.invoiceType} onChange={(e) => setCreateForm({ ...createForm, invoiceType: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal">
                  {INVOICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold text-muted">
                Course (optional)
                <select value={createForm.courseId} onChange={(e) => setCreateForm({ ...createForm, courseId: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal">
                  <option value="">None</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Description / Items
              <textarea value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} rows={2} placeholder="e.g. Registration fee for Web Development Fundamentals" className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="grid gap-1 text-xs font-bold text-muted">
                Amount
                <input type="number" min="0" step="0.01" value={createForm.amount} onChange={(e) => setCreateForm({ ...createForm, amount: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
              </label>
              <label className="grid gap-1 text-xs font-bold text-muted">
                Discount
                <input type="number" min="0" step="0.01" value={createForm.discount} onChange={(e) => setCreateForm({ ...createForm, discount: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
              </label>
              <label className="grid gap-1 text-xs font-bold text-muted">
                Due Date
                <input type="date" value={createForm.dueDate} onChange={(e) => setCreateForm({ ...createForm, dueDate: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
              </label>
            </div>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Notes
              <textarea value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} rows={2} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
            </label>
            {message && <p className="text-xs text-primary">{message}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setCreating(false)} disabled={saving} className="px-4 py-2 text-sm font-bold text-muted">Cancel</button>
              <button onClick={submitCreate} disabled={saving || !createStudent || !createForm.description.trim() || !createForm.amount} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {saving ? "Creating..." : "Create Invoice"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Invoice (manual, unpaid only) */}
      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8">
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-card p-6 shadow-xl">
            <h4 className="text-sm font-bold text-ink">Edit Invoice — {editingRow.invoiceNumber}</h4>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs font-bold text-muted">
                Invoice Type
                <select value={editForm.invoiceType} onChange={(e) => setEditForm({ ...editForm, invoiceType: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal">
                  {INVOICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold text-muted">
                Course (optional)
                <select value={editForm.courseId} onChange={(e) => setEditForm({ ...editForm, courseId: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal">
                  <option value="">None</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Description / Items
              <textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={2} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label className="grid gap-1 text-xs font-bold text-muted">
                Amount
                <input type="number" min="0" step="0.01" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
              </label>
              <label className="grid gap-1 text-xs font-bold text-muted">
                Discount
                <input type="number" min="0" step="0.01" value={editForm.discount} onChange={(e) => setEditForm({ ...editForm, discount: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
              </label>
              <label className="grid gap-1 text-xs font-bold text-muted">
                Due Date
                <input type="date" value={editForm.dueDate} onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
              </label>
            </div>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Notes
              <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={2} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
            </label>
            {message && <p className="text-xs text-primary">{message}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setEditingRow(null)} disabled={saving} className="px-4 py-2 text-sm font-bold text-muted">Cancel</button>
              <button onClick={submitEdit} disabled={saving || !editForm.description.trim() || !editForm.amount} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail */}
      {viewingRow && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8">
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-ink">Invoice {viewingRow.invoiceNumber}</h4>
              <InvoiceStatusBadge row={viewingRow} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <dt className="text-subtle">Student</dt><dd className="text-right font-semibold text-ink">{viewingRow.studentName}</dd>
              <dt className="text-subtle">Type</dt><dd className="text-right text-ink">{viewingRow.invoiceType}</dd>
              {viewingRow.courseName && (<><dt className="text-subtle">Training</dt><dd className="text-right text-ink">{viewingRow.courseName}</dd></>)}
              {viewingRow.batchName && (<><dt className="text-subtle">Batch</dt><dd className="text-right text-ink">{viewingRow.batchName}</dd></>)}
              <dt className="text-subtle">Description</dt><dd className="text-right text-ink">{viewingRow.description}</dd>
              <dt className="text-subtle">Invoice Date</dt><dd className="text-right text-ink">{formatDate(viewingRow.issueDate)}</dd>
              {viewingRow.dueDate && (<><dt className="text-subtle">Due Date</dt><dd className="text-right text-ink">{formatDate(viewingRow.dueDate)}</dd></>)}
            </dl>
            <div className="rounded-xl border border-border-subtle p-3">
              <dl className="grid grid-cols-2 gap-y-2 text-xs">
                <dt className="text-subtle">Subtotal</dt><dd className="text-right text-ink">{formatMoney(viewingRow.subtotal)}</dd>
                <dt className="text-subtle">Discount</dt><dd className="text-right text-ink">{formatMoney(viewingRow.discount)}</dd>
                <dt className="text-subtle">Total</dt><dd className="text-right font-bold text-ink">{formatMoney(viewingRow.totalAmount)}</dd>
                <dt className="text-subtle">Paid</dt><dd className="text-right font-bold text-success">{formatMoney(viewingRow.paidAmount)}</dd>
                <dt className="text-subtle">Outstanding</dt><dd className="text-right font-bold text-primary">{formatMoney(viewingRow.dueAmount)}</dd>
              </dl>
            </div>
            {viewingRow.notes && <p className="text-xs text-muted">Notes: {viewingRow.notes}</p>}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button onClick={() => setViewingRow(null)} className="px-4 py-2 text-sm font-bold text-muted">Close</button>
              {viewingRow.status !== "Cancelled" && viewingRow.dueAmount > 0 && (
                <button onClick={() => openPayment(viewingRow)} className="rounded-xl bg-success px-4 py-2 text-sm font-bold text-white">Record Payment</button>
              )}
              <button onClick={() => viewPdf(viewingRow)} disabled={openingId === viewingRow.id} className="rounded-xl border border-border-subtle px-4 py-2 text-sm font-bold text-ink disabled:opacity-60">Print</button>
              <button onClick={() => downloadPdf(viewingRow)} disabled={openingId === viewingRow.id} className="rounded-xl border border-border-subtle px-4 py-2 text-sm font-bold text-ink disabled:opacity-60">Download PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment */}
      {payingRow && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-card p-6 shadow-xl">
            <h4 className="text-sm font-bold text-ink">Record Payment — {payingRow.invoiceNumber}</h4>
            <p className="text-xs text-muted">Outstanding due: <b className="text-primary">{formatMoney(payingRow.dueAmount)}</b></p>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Amount
              <input type="number" min="0" step="0.01" max={payingRow.dueAmount} value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs font-bold text-muted">
                Method
                <select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal">
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold text-muted">
                Date
                <input type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
              </label>
            </div>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Reference / Transaction ID
              <input value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Notes
              <textarea value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} rows={2} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
            </label>
            {message && <p className="text-xs text-primary">{message}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setPayingRow(null)} disabled={saving} className="px-4 py-2 text-sm font-bold text-muted">Cancel</button>
              <button onClick={submitPayment} disabled={saving || !paymentForm.amount || Number(paymentForm.amount) <= 0} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {saving ? "Recording..." : "Record Payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
