"use client";

import { CircleDollarSign, Receipt, TrendingDown, Wallet } from "lucide-react";
import { PaymentStatusBadge, formatDate, formatMoney } from "../training/PaymentHistoryTable";
import AnimatedNumber from "./AnimatedNumber";
import StatCard from "./StatCard";
import { SkeletonList, SkeletonStats } from "../ui/Skeleton";

// No monthly trend chart: the project has no charting library installed
// (checked package.json), and the task only asks for one "if existing
// chart infrastructure exists" — adding a new charting dependency for this
// alone would be its own architectural decision, out of scope here.
export default function FinanceDashboardTab({ overview, loading }) {
  if (loading || !overview) {
    return (
      <div className="space-y-6">
        <SkeletonStats count={4} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" />
        <SkeletonStats count={3} className="grid gap-4 sm:grid-cols-3" />
        <div className="grid gap-4 lg:grid-cols-3">
          <SkeletonList count={4} />
          <SkeletonList count={4} />
          <SkeletonList count={4} />
        </div>
      </div>
    );
  }
  const { totals, payments, expenses, income = [] } = overview;

  const recentTransactions = [
    ...payments.map((item) => ({ kind: "Income", date: item.paymentDate, label: `${item.studentName} · ${item.courseTitle}`, amount: item.amount })),
    ...income
      .filter((item) => (item.status || "Paid") !== "Pending")
      .map((item) => ({ kind: "Income", date: item.date, label: `${item.source}${item.personName ? ` · ${item.personName}` : ""}`, amount: item.amount })),
    ...expenses.map((item) => ({ kind: "Expense", date: item.expenseDate, label: `${item.category} · ${item.description || "—"}`, amount: -item.amount })),
  ]
    .sort((left, right) => (right.date || "").localeCompare(left.date || ""))
    .slice(0, 6);

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Income" value={totals.income} format={formatMoney} icon={Wallet} iconBg="bg-success-soft" iconColor="text-success" valueColor="text-success" />
        <StatCard label="Outstanding Due" value={totals.due} format={formatMoney} icon={Receipt} iconBg="bg-warning-soft" iconColor="text-warning" valueColor="text-warning" />
        <StatCard label="Total Expenses" value={totals.expenses} format={formatMoney} icon={TrendingDown} iconBg="bg-active" iconColor="text-primary" valueColor="text-primary" />
        <StatCard
          label="Net Profit"
          value={totals.netProfit}
          format={formatMoney}
          icon={CircleDollarSign}
          iconBg={totals.netProfit >= 0 ? "bg-success-soft" : "bg-active"}
          iconColor={totals.netProfit >= 0 ? "text-success" : "text-primary"}
          valueColor={totals.netProfit >= 0 ? "text-success" : "text-primary"}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-2xl border border-border-subtle bg-card p-4 text-center shadow-sm">
          <PaymentStatusBadge value="Paid" />
          <p className="mt-2 text-xl font-extrabold text-ink"><AnimatedNumber value={totals.paidCount} /></p>
          <p className="text-[10px] font-bold uppercase text-subtle">Admissions</p>
        </article>
        <article className="rounded-2xl border border-border-subtle bg-card p-4 text-center shadow-sm">
          <PaymentStatusBadge value="Partial" />
          <p className="mt-2 text-xl font-extrabold text-ink"><AnimatedNumber value={totals.partialCount} /></p>
          <p className="text-[10px] font-bold uppercase text-subtle">Admissions</p>
        </article>
        <article className="rounded-2xl border border-border-subtle bg-card p-4 text-center shadow-sm">
          <PaymentStatusBadge value="Unpaid" />
          <p className="mt-2 text-xl font-extrabold text-ink"><AnimatedNumber value={totals.unpaidCount} /></p>
          <p className="text-[10px] font-bold uppercase text-subtle">Admissions</p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm lg:col-span-1">
          <h3 className="mb-3 font-bold text-ink">Recent Transactions</h3>
          {recentTransactions.length ? (
            <div className="space-y-2">
              {recentTransactions.map((item, index) => (
                <div key={index} className="flex items-center justify-between border-b border-border-subtle py-2 text-xs last:border-0">
                  <div className="min-w-0">
                    <b className="block truncate text-ink">{item.label}</b>
                    <span className="text-subtle">{formatDate(item.date)} · {item.kind}</span>
                  </div>
                  <span className={`shrink-0 font-bold ${item.amount >= 0 ? "text-success" : "text-primary"}`}>
                    {item.amount >= 0 ? "+" : "-"}{formatMoney(Math.abs(item.amount))}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted">No transactions recorded yet.</p>
          )}
        </div>
        <div className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm lg:col-span-1">
          <h3 className="mb-3 font-bold text-ink">Recent Payments</h3>
          {payments.length ? (
            <div className="space-y-2">
              {payments.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-center justify-between border-b border-border-subtle py-2 text-xs last:border-0">
                  <div className="min-w-0">
                    <b className="block truncate text-ink">{item.studentName}</b>
                    <span className="text-subtle">{formatDate(item.paymentDate)} · {item.paymentMethod}</span>
                  </div>
                  <span className="shrink-0 font-bold text-success">{formatMoney(item.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted">No payments recorded yet.</p>
          )}
        </div>
        <div className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm lg:col-span-1">
          <h3 className="mb-3 font-bold text-ink">Recent Expenses</h3>
          {expenses.length ? (
            <div className="space-y-2">
              {expenses.slice(0, 6).map((item) => (
                <div key={item.id} className="flex items-center justify-between border-b border-border-subtle py-2 text-xs last:border-0">
                  <div className="min-w-0">
                    <b className="block truncate text-ink">{item.category}</b>
                    <span className="text-subtle">{formatDate(item.expenseDate)} · {item.paymentMethod}</span>
                  </div>
                  <span className="shrink-0 font-bold text-warning">{formatMoney(item.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted">No expenses recorded yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
