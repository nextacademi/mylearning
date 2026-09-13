"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CreditCard, Scale, UserCheck } from "lucide-react";
import { formatMoney } from "../../training/PaymentHistoryTable";
import { EmptyChartState } from "./ChartCard";

// Section 10 — Outstanding Due is deliberately kept out of Total Revenue
// everywhere on this page; it only ever reads totals.due, never totals.income.
export function OutstandingDueCard({ totals, loading, onNavigate }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-warning-soft text-warning">
            <CreditCard className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-lg font-bold text-ink">Outstanding Due</h3>
            <p className="text-xs text-muted">Fees invoiced but not yet collected</p>
          </div>
        </div>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate("Finance")}
            className="rounded-full border border-border-subtle px-3 py-1.5 text-xs font-bold text-primary hover:bg-active"
          >
            View Finance →
          </button>
        )}
      </div>
      {loading ? (
        <p className="py-6 text-center text-sm text-muted">Loading outstanding due...</p>
      ) : (
        <>
          <p className="text-3xl font-extrabold text-warning">{formatMoney(totals?.due || 0)}</p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center text-xs">
            <div className="rounded-xl bg-success-soft p-3">
              <b className="block text-lg text-success">{totals?.paidCount || 0}</b>
              <span className="text-muted">Paid</span>
            </div>
            <div className="rounded-xl bg-warning-soft p-3">
              <b className="block text-lg text-warning">{totals?.partialCount || 0}</b>
              <span className="text-muted">Partial</span>
            </div>
            <div className="rounded-xl bg-active p-3">
              <b className="block text-lg text-primary">{totals?.unpaidCount || 0}</b>
              <span className="text-muted">Unpaid</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Section 11 — Net Profit = actual collected revenue minus expenses, never
// outstanding due. Shows a real empty state instead of a 0-value bar when
// no expenses have ever been recorded, rather than implying "0 expenses."
export function RevenueVsExpenses({ totals, expensesCount, loading }) {
  const hasExpenses = (expensesCount || 0) > 0;
  const chartData = hasExpenses
    ? [
        { name: "Collected Revenue", value: totals?.income || 0, color: "#22C55E" },
        { name: "Expenses", value: totals?.expenses || 0, color: "#FF2D2D" },
        { name: "Net Profit", value: totals?.netProfit || 0, color: "#3B82F6" },
      ]
    : [];

  return (
    <div className="rounded-xl border border-border-subtle bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-success-soft text-success">
          <Scale className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-lg font-bold text-ink">Revenue vs Expenses</h3>
          <p className="text-xs text-muted">Actual collected revenue minus recorded expenses</p>
        </div>
      </div>
      {loading ? (
        <EmptyChartState message="Loading finance summary..." />
      ) : hasExpenses ? (
        <div className="h-70 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#667085" }} />
              <YAxis tick={{ fontSize: 11, fill: "#667085" }} tickFormatter={(value) => formatMoney(value)} width={80} />
              <Tooltip
                formatter={(value) => [formatMoney(value), "Amount"]}
                contentStyle={{ borderRadius: 12, border: "1px solid #e7e5e4", fontSize: 12 }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={60}>
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyChartState message="No expenses recorded yet — record one in Finance to see Revenue vs Expenses." />
      )}
    </div>
  );
}

// Section 7 — only the two enrollment statuses that actually exist in this
// schema (active / withdrawn). No "completed"/"pending"/"cancelled" cards,
// since those states are never written anywhere in this data model.
export function EnrollmentBreakdown({ activeCount, withdrawnCount, loading, error, onRetry }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-info-soft text-info">
          <UserCheck className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-lg font-bold text-ink">Student Enrollment Breakdown</h3>
          <p className="text-xs text-muted">Real enrollment status across the academy</p>
        </div>
      </div>
      {loading ? (
        <p className="py-6 text-center text-sm text-muted">Loading enrollment breakdown...</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-success-soft p-4 text-center">
            <b className="block text-2xl text-success">{activeCount ?? 0}</b>
            <span className="text-xs text-muted">Active enrollments</span>
          </div>
          <div className="rounded-xl bg-page p-4 text-center">
            {error ? (
              <>
                <b className="block text-xs font-semibold text-primary">Unable to load</b>
                {onRetry && (
                  <button type="button" onClick={onRetry} className="mt-1 text-[10px] font-bold text-primary underline">
                    Retry
                  </button>
                )}
              </>
            ) : (
              <>
                <b className="block text-2xl text-subtle">{withdrawnCount ?? 0}</b>
                <span className="text-xs text-muted">Withdrawn enrollments</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
