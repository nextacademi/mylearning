"use client";

import { useCallback, useEffect, useState } from "react";
import { loadFinanceOverview } from "../../lib/services/finance-service";
import AdmissionsManagement from "./AdmissionsManagement";
import FinanceDashboardTab from "./FinanceDashboardTab";
import IncomeTab from "./IncomeTab";
import IncomeManagementTab from "./IncomeManagementTab";
import ExpensesTab from "./ExpensesTab";
import AssetsTab from "./AssetsTab";
import TransactionsTab from "./TransactionsTab";
import ProfitLossTab from "./ProfitLossTab";
import ReportsTab from "./ReportsTab";

// One sidebar entry ("Finance"), one shell — matches every other module in
// this dashboard (Training, Users, etc. are also single sidebar items with
// their own internal tabs, e.g. Training Details' Overview/Classes/...).
// No second dashboard shell, no new sidebar items.
const tabs = ["Dashboard", "Income", "Income / Payments", "Outstanding Due", "Expenses", "Assets", "Transactions", "Profit & Loss", "Reports"];

export default function FinanceManagement() {
  const [tab, setTab] = useState("Dashboard");
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    loadFinanceOverview()
      .then((result) => {
        setOverview(result);
        setError("");
      })
      .catch((err) => setError(err.message || "Unable to load finance data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 text-ink shadow-xl">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Finance</p>
          <h2 className="mt-2 text-3xl font-black">Finance Management</h2>
          <p className="mt-2 text-sm text-muted">Income, outstanding dues, expenses, and profit &amp; loss for the whole academy.</p>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2 overflow-x-auto rounded-2xl border border-border-subtle bg-card p-2 shadow-sm">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold ${tab === item ? "bg-primary text-white" : "text-muted hover:bg-active"}`}
          >
            {item}
          </button>
        ))}
      </nav>

      {error && <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>}

      {tab === "Dashboard" && <FinanceDashboardTab overview={overview} loading={loading} />}
      {tab === "Income" && <IncomeManagementTab income={overview?.income || []} loading={loading} onChanged={load} />}
      {tab === "Income / Payments" && <IncomeTab payments={overview?.payments || []} loading={loading} />}
      {tab === "Outstanding Due" && <AdmissionsManagement />}
      {tab === "Expenses" && <ExpensesTab expenses={overview?.expenses || []} loading={loading} onChanged={load} />}
      {tab === "Assets" && <AssetsTab />}
      {tab === "Transactions" && <TransactionsTab payments={overview?.payments || []} expenses={overview?.expenses || []} income={overview?.income || []} loading={loading} />}
      {tab === "Profit & Loss" && <ProfitLossTab />}
      {tab === "Reports" && <ReportsTab />}
    </div>
  );
}
