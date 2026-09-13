"use client";

import { useState } from "react";

// Currency is fixed to SGD project-wide — no lookup table needed.
export const formatMoney = (value) => `S$${Number(value || 0).toLocaleString()}`;

export const formatDate = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString("en-SG", { day: "2-digit", month: "short", year: "numeric" });
};

// Exported so the system-wide Finance "Income / Payments" tab can reuse the
// exact same receipt rendering instead of a second copy.
export function Receipt({ payment, studentName, courseTitle, courseCode, close }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <style>{`@media print { .no-print { display: none !important; } body * { visibility: hidden; } #payment-receipt, #payment-receipt * { visibility: visible; } #payment-receipt { position: fixed; inset: 0; margin: auto; } }`}</style>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl">
        <div id="payment-receipt" className="space-y-4 rounded-2xl border border-border-subtle p-6">
          <div className="text-center">
            <p className="text-lg font-black text-ink">Next Academy</p>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">Payment Receipt</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <dt className="text-subtle">Student Name</dt><dd className="text-right font-semibold text-ink">{studentName}</dd>
            <dt className="text-subtle">Training Name</dt><dd className="text-right font-semibold text-ink">{courseTitle}</dd>
            <dt className="text-subtle">Training ID</dt><dd className="text-right font-mono text-ink">{courseCode}</dd>
            <dt className="text-subtle">Payment Date</dt><dd className="text-right text-ink">{formatDate(payment.paymentDate)}</dd>
            <dt className="text-subtle">Receipt / Reference No.</dt><dd className="text-right text-ink">{payment.reference || payment.id}</dd>
            <dt className="text-subtle">Payment Method</dt><dd className="text-right text-ink">{payment.paymentMethod}</dd>
          </dl>
          <div className="border-t border-border-subtle pt-3">
            <dl className="grid grid-cols-2 gap-y-2 text-xs">
              <dt className="text-subtle">Previous Paid</dt><dd className="text-right text-ink">{formatMoney(payment.previousPaid)}</dd>
              <dt className="text-subtle">Current Payment</dt><dd className="text-right font-bold text-primary">{formatMoney(payment.amount)}</dd>
              <dt className="text-subtle">Total Paid</dt><dd className="text-right font-bold text-ink">{formatMoney((payment.previousPaid || 0) + payment.amount)}</dd>
              <dt className="text-subtle">Remaining Due</dt><dd className="text-right text-ink">{formatMoney(payment.dueAfter ?? 0)}</dd>
            </dl>
          </div>
        </div>
        <div className="no-print mt-4 flex justify-end gap-2">
          <button type="button" onClick={close} className="px-4 py-2 text-sm font-bold text-muted">Close</button>
          <button type="button" onClick={() => window.print()} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white">
            Print
          </button>
        </div>
      </div>
    </div>
  );
}

const paymentStatusTones = {
  Paid: "bg-success-soft text-success",
  Partial: "bg-warning-soft text-warning",
  Unpaid: "bg-active text-primary",
};
export function PaymentStatusBadge({ value }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${paymentStatusTones[value] || "bg-page text-muted"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" /> {value || "Unpaid"}
    </span>
  );
}

// Shared by the Admin/Director admission detail view and the Student's own
// read-only payment view — same rendering, same "View Receipt" affordance.
// Neither caller passes edit/delete handlers because none exist: payments
// are append-only records.
export default function PaymentHistoryTable({ payments, studentName, courseTitle, courseCode, finalFee }) {
  const [receiptFor, setReceiptFor] = useState(null);
  const sorted = [...payments].sort((left, right) => (right.paymentDate || "").localeCompare(left.paymentDate || ""));

  if (!sorted.length) {
    return <p className="py-6 text-center text-sm text-muted">No payments recorded yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b text-[10px] uppercase tracking-wider text-subtle">
          <tr>{["Date", "Amount", "Method", "Reference", "Status", "Notes", "Actions"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr>
        </thead>
        <tbody>
          {sorted.map((payment) => (
            <tr key={payment.id} className="border-b border-border-subtle">
              <td className="p-3 text-xs">{formatDate(payment.paymentDate)}</td>
              <td className="p-3 text-xs font-bold text-ink">{formatMoney(payment.amount)}</td>
              <td className="p-3 text-xs text-muted">{payment.paymentMethod}</td>
              <td className="p-3 text-xs text-muted">{payment.reference || "—"}</td>
              <td className="p-3"><PaymentStatusBadge value={payment.status || "Paid"} /></td>
              <td className="max-w-[220px] truncate p-3 text-xs text-muted">{payment.notes || "—"}</td>
              <td className="p-3 text-xs font-bold">
                <button type="button" onClick={() => setReceiptFor(payment)} className="text-primary">View Receipt</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {receiptFor && (
        <Receipt
          payment={{
            ...receiptFor,
            dueAfter: Math.max(0, (Number(finalFee) || 0) - ((Number(receiptFor.previousPaid) || 0) + Number(receiptFor.amount))),
          }}
          studentName={studentName}
          courseTitle={courseTitle}
          courseCode={courseCode}
          close={() => setReceiptFor(null)}
        />
      )}
    </div>
  );
}
