"use client";

import { useMemo, useState } from "react";
import { formatDate, formatMoney } from "../training/PaymentHistoryTable";
import DataTable, { StatusBadge } from "../data-table/DataTable";

// A derived view over the real collections (payments + manual finance_income
// + expenses) — deliberately NOT a separate `transactions` collection, so
// there is never a second, possibly-divergent record of the same money
// movement. Only realised money is shown: "Pending" manual income is a
// receivable, not a transaction. No refund type is shown because no refund
// mechanism exists anywhere in the app to generate one.
const typeFilters = ["All", "Income", "Expense"];

export default function TransactionsTab({ payments, expenses, income = [], loading }) {
  const [typeFilter, setTypeFilter] = useState("All");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(() => {
    const paymentRows = payments.map((item) => ({
      id: item.id,
      date: item.paymentDate,
      type: "Income",
      description: item.studentName,
      training: item.courseTitle,
      category: "—",
      income: item.amount,
      expense: 0,
      paymentMethod: item.paymentMethod,
      reference: item.reference,
      recordedByName: item.recordedByName,
    }));
    const manualIncomeRows = income
      .filter((item) => (item.status || "Paid") !== "Pending")
      .map((item) => ({
        id: item.id,
        date: item.date,
        type: "Income",
        description: item.personName || item.source,
        training: item.courseName || "—",
        category: item.source,
        income: item.amount,
        expense: 0,
        paymentMethod: item.paymentMethod,
        reference: item.reference,
        recordedByName: item.recordedByName,
      }));
    const expenseRows = expenses.map((item) => ({
      id: item.id,
      date: item.expenseDate,
      type: "Expense",
      description: item.description || item.category,
      training: "—",
      category: item.category,
      income: 0,
      expense: item.amount,
      paymentMethod: item.paymentMethod,
      reference: item.reference,
      recordedByName: item.recordedByName,
    }));
    return [...paymentRows, ...manualIncomeRows, ...expenseRows].sort((left, right) => (right.date || "").localeCompare(left.date || ""));
  }, [payments, income, expenses]);

  const dated = useMemo(
    () => rows.filter((row) => (typeFilter === "All" || row.type === typeFilter) && (!from || (row.date || "") >= from) && (!to || (row.date || "") <= to)),
    [rows, typeFilter, from, to],
  );

  const columns = useMemo(() => [
    { key: "date", header: "Date", sortable: true, accessor: (r) => r.date || "", render: (r) => <span className="text-xs">{formatDate(r.date)}</span> },
    { key: "type", header: "Type", sortable: true, filter: {}, accessor: (r) => r.type, render: (r) => <StatusBadge tone={r.type === "Income" ? "green" : "orange"}>{r.type}</StatusBadge> },
    { key: "description", header: "Student / Description", sortable: true, accessor: (r) => r.description || "", render: (r) => <b className="text-ink">{r.description}</b> },
    { key: "training", header: "Training", sortable: true, filter: {}, accessor: (r) => r.training || "" },
    { key: "category", header: "Category", sortable: true, filter: {}, accessor: (r) => r.category || "" },
    { key: "income", header: "Income", align: "right", sortable: true, accessor: (r) => Number(r.income || 0), render: (r) => (r.income ? <b className="text-success">{formatMoney(r.income)}</b> : "—"), exportValue: (r) => Number(r.income || 0) },
    { key: "expense", header: "Expense", align: "right", sortable: true, accessor: (r) => Number(r.expense || 0), render: (r) => (r.expense ? <b className="text-warning">{formatMoney(r.expense)}</b> : "—"), exportValue: (r) => Number(r.expense || 0) },
    { key: "paymentMethod", header: "Method", filter: {}, accessor: (r) => r.paymentMethod || "" },
    { key: "reference", header: "Reference", accessor: (r) => r.reference || "" },
    { key: "recordedByName", header: "Recorded By", sortable: true, accessor: (r) => r.recordedByName || "" },
  ], []);

  return (
    <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold text-muted">
        {typeFilters.map((item) => (
          <button key={item} type="button" onClick={() => setTypeFilter(item)} className={`rounded-full px-3 py-1.5 transition ${typeFilter === item ? "bg-success text-white" : "bg-page text-muted hover:text-ink"}`}>{item}</button>
        ))}
        <span className="ml-2">Date</span>
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 font-normal" />
        <span>–</span>
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 font-normal" />
        {(from || to) && <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="text-primary">clear</button>}
      </div>

      <DataTable
        title="transactions"
        name="transactions"
        columns={columns}
        rows={dated}
        loading={loading}
        getRowId={(r) => `${r.type}-${r.id}`}
        initialSort={{ key: "date", dir: "desc" }}
        pageSize={12}
        emptyLabel="No transactions match your filters."
      />
    </section>
  );
}
