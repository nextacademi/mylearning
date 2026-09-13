"use client";

import { useCallback, useEffect, useState } from "react";
import { loadFinanceOverview } from "../../lib/services/finance-service";
import { formatMoney } from "../training/PaymentHistoryTable";

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}
function rangeFor(preset) {
  const now = new Date();
  const today = isoDate(now);
  if (preset === "Today") return { from: today, to: today };
  if (preset === "This Week") {
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    return { from: isoDate(start), to: today };
  }
  if (preset === "This Month") {
    return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
  }
  if (preset === "This Year") {
    return { from: isoDate(new Date(now.getFullYear(), 0, 1)), to: today };
  }
  return null; // Custom Range — handled separately
}
const presets = ["Today", "This Week", "This Month", "This Year", "Custom Range"];

export default function ProfitLossTab() {
  const [preset, setPreset] = useState("This Month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const range = preset === "Custom Range" ? { from: customFrom, to: customTo } : rangeFor(preset);

  const load = useCallback(() => {
    if (preset === "Custom Range" && (!customFrom || !customTo)) return;
    setLoading(true);
    loadFinanceOverview(range || {})
      .then((result) => {
        setOverview(result);
        setError("");
      })
      .catch((err) => setError(err.message || "Unable to load profit & loss data."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const income = overview?.totals.income ?? 0;
  const expenses = overview?.totals.expenses ?? 0;
  const netProfit = income - expenses;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {presets.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setPreset(item)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${preset === item ? "bg-primary text-white" : "bg-page text-muted hover:bg-active hover:text-primary"}`}
              >
                {item}
              </button>
            ))}
          </div>
          {preset === "Custom Range" && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 text-sm" />
              <span className="text-xs text-subtle">to</span>
              <input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 text-sm" />
            </div>
          )}
        </div>

        {error && <p className="mb-3 rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}

        {loading ? (
          <p className="py-10 text-center text-sm text-muted">Loading profit &amp; loss...</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-page p-5 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Revenue / Income</p>
              <p className="mt-2 text-2xl font-extrabold text-success">{formatMoney(income)}</p>
              <p className="mt-1 text-[10px] text-subtle">Collected student payments + recorded income</p>
            </div>
            <div className="rounded-2xl bg-page p-5 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Expenses</p>
              <p className="mt-2 text-2xl font-extrabold text-warning">{formatMoney(expenses)}</p>
              <p className="mt-1 text-[10px] text-subtle">Actual recorded expenses</p>
            </div>
            <div className="rounded-2xl bg-page p-5 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Net Profit</p>
              <p className={`mt-2 text-2xl font-extrabold ${netProfit >= 0 ? "text-success" : "text-primary"}`}>{formatMoney(netProfit)}</p>
              <p className="mt-1 text-[10px] text-subtle">Income − Expenses</p>
            </div>
          </div>
        )}
      </section>
      <p className="text-xs text-subtle">Outstanding student dues are never included in Revenue/Income above — only payments actually collected within the selected period.</p>
    </div>
  );
}
