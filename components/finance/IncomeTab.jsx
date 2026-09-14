"use client";

import { useMemo, useState } from "react";
import { PaymentStatusBadge, Receipt, formatDate, formatMoney } from "../training/PaymentHistoryTable";
import DataTable from "../data-table/DataTable";

export default function IncomeTab({ payments, loading }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [receiptFor, setReceiptFor] = useState(null);

  const dated = useMemo(
    () => payments.filter((item) => (!from || (item.paymentDate || "") >= from) && (!to || (item.paymentDate || "") <= to)),
    [payments, from, to],
  );

  const columns = useMemo(() => [
    { key: "id", header: "Payment ID", accessor: (p) => p.id, render: (p) => <span className="font-mono text-[11px] text-muted">{p.id.slice(0, 10)}…</span> },
    { key: "studentName", header: "Student", sortable: true, accessor: (p) => `${p.studentName || ""} ${p.userId || ""}`, render: (p) => <span><b className="block text-ink">{p.studentName}</b><span className="text-[11px] text-muted">{p.userId}</span></span>, exportValue: (p) => p.studentName || "" },
    { key: "courseTitle", header: "Training", sortable: true, filter: {}, accessor: (p) => p.courseTitle || "", render: (p) => <span><b className="block text-ink">{p.courseTitle}</b><span className="font-mono text-[11px] text-muted">{p.courseCode}</span></span> },
    { key: "paymentDate", header: "Date", sortable: true, accessor: (p) => p.paymentDate || "", render: (p) => <span className="text-xs">{formatDate(p.paymentDate)}</span> },
    { key: "amount", header: "Amount", align: "right", sortable: true, accessor: (p) => Number(p.amount || 0), render: (p) => <b className="text-success">{formatMoney(p.amount)}</b>, exportValue: (p) => Number(p.amount || 0) },
    { key: "paymentMethod", header: "Method", sortable: true, filter: {}, accessor: (p) => p.paymentMethod || "" },
    { key: "reference", header: "Reference", accessor: (p) => p.reference || "" },
    { key: "recordedByName", header: "Recorded By", sortable: true, accessor: (p) => p.recordedByName || "" },
    { key: "status", header: "Status", sortable: true, filter: {}, accessor: (p) => p.status || "Paid", render: (p) => <PaymentStatusBadge value={p.status || "Paid"} /> },
  ], []);

  return (
    <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold text-muted">
        <span>Date range</span>
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 font-normal" />
        <span>–</span>
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 font-normal" />
        {(from || to) && <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="text-primary">clear</button>}
      </div>

      <DataTable
        title="payments"
        name="payments"
        columns={columns}
        rows={dated}
        loading={loading}
        initialSort={{ key: "paymentDate", dir: "desc" }}
        pageSize={10}
        emptyLabel="No payments recorded yet."
        rowActions={(item) => (
          <button type="button" onClick={() => setReceiptFor(item)} className="rounded-lg bg-info px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90">Receipt</button>
        )}
      />

      {receiptFor && (
        <Receipt
          payment={{
            ...receiptFor,
            dueAfter: Math.max(0, (Number(receiptFor.finalFee) || 0) - ((Number(receiptFor.previousPaid) || 0) + Number(receiptFor.amount))),
          }}
          studentName={receiptFor.studentName}
          courseTitle={receiptFor.courseTitle}
          courseCode={receiptFor.courseCode}
          close={() => setReceiptFor(null)}
        />
      )}
    </section>
  );
}
