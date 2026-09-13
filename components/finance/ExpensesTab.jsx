"use client";

import { useMemo, useState } from "react";
import { stopEnterSubmit } from "../../lib/ui/keyboard";
import { createExpense, deleteExpense as deleteExpenseRequest, updateExpense } from "../../lib/services/finance-service";
import { formatDate, formatMoney } from "../training/PaymentHistoryTable";
import { useConfirm } from "../ui/ConfirmDialog";
import DataTable, { StatusBadge } from "../data-table/DataTable";

const categories = ["Rent", "Salary", "Utilities", "Equipment", "Marketing", "Transport", "Maintenance", "Software", "Training Materials", "Other"];
const methods = ["Cash", "Bank Transfer", "Card", "Other"];

function Dialog({ title, children, close }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button type="button" onClick={close} className="text-xl text-muted" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ExpenseForm({ initial, saving, onCancel, onSubmit }) {
  const [form, setForm] = useState(
    initial || { category: "", amount: "", expenseDate: new Date().toISOString().slice(0, 10), paymentMethod: "Cash", description: "", reference: "" },
  );
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  const amountNum = form.amount === "" ? null : Number(form.amount);
  const amountError = amountNum !== null && amountNum <= 0 ? "Expense amount must be greater than zero." : null;

  async function submit(event) {
    event.preventDefault();
    if (!form.category) return setError("Choose an expense category.");
    if (amountNum === null || amountError) return setError(amountError || "Enter an expense amount.");
    if (!form.expenseDate) return setError("Expense date is required.");
    setError("");
    try {
      await onSubmit({ ...form, amount: amountNum });
    } catch (err) {
      setError(err.message || "Unable to save this expense.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="grid gap-1 text-xs font-bold text-muted">
        Category
        <select value={form.category} onChange={set("category")} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm">
          <option value="">Choose a category</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-bold text-muted">
        Amount
        <span className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-subtle">S$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.amount}
            onChange={set("amount")}
            onKeyDown={stopEnterSubmit}
            className={`w-full rounded-xl border px-3 py-2.5 pl-8 text-sm outline-none focus:ring-2 focus:ring-primary ${amountError ? "border-primary" : "border-border-subtle"}`}
          />
        </span>
        {amountError && <span className="text-[11px] font-semibold text-primary">{amountError}</span>}
      </label>
      <label className="grid gap-1 text-xs font-bold text-muted">
        Expense Date
        <input type="date" value={form.expenseDate} onChange={set("expenseDate")} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm" />
      </label>
      <label className="grid gap-1 text-xs font-bold text-muted">
        Payment Method
        <select value={form.paymentMethod} onChange={set("paymentMethod")} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm">
          {methods.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-bold text-muted">
        Description
        <textarea value={form.description} onChange={set("description")} rows={2} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal" />
      </label>
      <label className="grid gap-1 text-xs font-bold text-muted">
        Reference (optional)
        <input value={form.reference} onChange={set("reference")} onKeyDown={stopEnterSubmit} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal" />
      </label>
      {error && <p className="rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 text-sm font-bold text-muted">Cancel</button>
        <button disabled={saving || Boolean(amountError)} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {saving ? "Saving..." : "Save Expense"}
        </button>
      </div>
    </form>
  );
}

export default function ExpensesTab({ expenses, loading, onChanged }) {
  const confirm = useConfirm();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const dated = useMemo(
    () => expenses.filter((item) => (!from || (item.expenseDate || "") >= from) && (!to || (item.expenseDate || "") <= to)),
    [expenses, from, to],
  );

  const columns = useMemo(() => [
    { key: "id", header: "Expense ID", accessor: (e) => e.id, render: (e) => <span className="font-mono text-[11px] text-muted">{e.id.slice(0, 10)}…</span> },
    { key: "category", header: "Category", sortable: true, filter: {}, accessor: (e) => e.category || "", render: (e) => <StatusBadge tone="purple">{e.category}</StatusBadge> },
    { key: "amount", header: "Amount", align: "right", sortable: true, accessor: (e) => Number(e.amount || 0), render: (e) => <b className="text-warning">{formatMoney(e.amount)}</b>, exportValue: (e) => Number(e.amount || 0) },
    { key: "expenseDate", header: "Date", sortable: true, accessor: (e) => e.expenseDate || "", exportValue: (e) => e.expenseDate || "", render: (e) => <span className="text-xs">{formatDate(e.expenseDate)}</span> },
    { key: "paymentMethod", header: "Method", sortable: true, filter: {}, accessor: (e) => e.paymentMethod || "" },
    { key: "description", header: "Description", accessor: (e) => e.description || "", render: (e) => <span className="block max-w-[220px] truncate text-xs text-muted">{e.description || "—"}</span> },
    { key: "reference", header: "Reference", accessor: (e) => e.reference || "" },
    { key: "recordedByName", header: "Recorded By", sortable: true, accessor: (e) => e.recordedByName || "" },
  ], []);

  async function handleCreate(values) {
    setSaving(true);
    try {
      await createExpense(values);
      setMessage("Expense added.");
      setAdding(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }
  async function handleUpdate(values) {
    setSaving(true);
    try {
      await updateExpense(editing.id, values);
      setMessage("Expense updated.");
      setEditing(null);
      onChanged();
    } finally {
      setSaving(false);
    }
  }
  async function handleDelete(expense) {
    if (!(await confirm({
      title: "Delete expense",
      message: `Delete this ${expense.category} expense of ${formatMoney(expense.amount)}? This cannot be undone.`,
      tone: "danger",
      confirmLabel: "Delete",
    }))) return;
    setError("");
    try {
      await deleteExpenseRequest(expense.id);
      setMessage("Expense deleted.");
      onChanged();
    } catch (err) {
      setError(err.message || "Unable to delete this expense.");
    }
  }

  return (
    <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-muted">
          <span>Date range</span>
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 font-normal" />
          <span>–</span>
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 font-normal" />
          {(from || to) && <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="text-primary">clear</button>}
        </div>
        <button type="button" onClick={() => setAdding(true)} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white">
          + Add Expense
        </button>
      </div>

      {message && <p className="mb-3 rounded-xl bg-success-soft p-3 text-xs text-success">{message}</p>}
      {error && <p className="mb-3 rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}

      <DataTable
        title="expenses"
        name="expenses"
        columns={columns}
        rows={dated}
        loading={loading}
        initialSort={{ key: "expenseDate", dir: "desc" }}
        pageSize={10}
        emptyLabel="No expenses recorded yet."
        rowActions={(item) => (
          <>
            <button type="button" onClick={() => setEditing(item)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-page">Edit</button>
            <button type="button" onClick={() => handleDelete(item)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-page">Delete</button>
          </>
        )}
      />

      {adding && (
        <Dialog title="Add Expense" close={() => setAdding(false)}>
          <ExpenseForm saving={saving} onCancel={() => setAdding(false)} onSubmit={handleCreate} />
        </Dialog>
      )}
      {editing && (
        <Dialog title="Edit Expense" close={() => setEditing(null)}>
          <ExpenseForm initial={editing} saving={saving} onCancel={() => setEditing(null)} onSubmit={handleUpdate} />
        </Dialog>
      )}
    </section>
  );
}
