"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../lib/auth-context";
import { markAllNotificationsRead, useUnreadNotificationsByType } from "../../lib/notification-data";
import { loadFinanceOverviewCached } from "../../lib/services/finance-service";
import AdmissionsManagement from "./AdmissionsManagement";
import InvoicesTab from "./InvoicesTab";
import FinanceDashboardTab from "./FinanceDashboardTab";
import IncomeTab from "./IncomeTab";
import IncomeManagementTab from "./IncomeManagementTab";
import ExpensesTab from "./ExpensesTab";
import AssetsTab from "./AssetsTab";
import TransactionsTab from "./TransactionsTab";
import ProfitLossTab from "./ProfitLossTab";
import ReportsTab from "./ReportsTab";
import AppointmentScheduler from "../appointments/AppointmentScheduler";

// One sidebar entry ("Finance"), one shell — matches every other module in
// this dashboard (Training, Users, etc. are also single sidebar items with
// their own internal tabs, e.g. Training Details' Overview/Classes/...).
// No second dashboard shell, no new sidebar items. Appointments moved in
// here from its own top-level sidebar item — Director/Admin manage it as
// part of Finance now; Student/Guest still reach the same
// AppointmentScheduler component from their own "Appointments" module,
// unchanged.
const tabs = ["Dashboard", "Invoices", "Income", "Income / Payments", "Outstanding Due", "Expenses", "Assets", "Transactions", "Profit & Loss", "Appointments", "Reports"];

export default function FinanceManagement() {
  const { user } = useAuth();
  const [tab, setTab] = useState("Dashboard");
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const newAppointments = useUnreadNotificationsByType(user?.uid, "appointment");

  // Opening the tab is the "I've seen it" signal — same idea as Contact
  // Inquiries' unread badge clearing once the list is opened.
  useEffect(() => {
    if (tab === "Appointments" && newAppointments.length) markAllNotificationsRead(newAppointments);
  }, [tab, newAppointments]);

  const load = useCallback((force = false) => {
    setLoading(true);
    loadFinanceOverviewCached({ force })
      .then((result) => {
        setOverview(result);
        setError("");
      })
      .catch((err) => setError(err.message || "Unable to load finance data."))
      .finally(() => setLoading(false));
  }, []);
  // onChanged reloads (after create/update/delete in Income/Expenses/etc.)
  // must never show stale cached data — the mount effect below is the
  // only caller that's allowed to use the cache as-is.
  const reload = useCallback(() => load(true), [load]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-4 text-ink shadow-sm md:p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Finance</p>
          <h2 className="mt-2 text-lg font-black">Finance Management</h2>
          <p className="mt-1 text-xs text-muted">Income, outstanding dues, expenses, and profit &amp; loss for the whole academy.</p>
        </div>
      </section>

      <nav className="flex flex-wrap gap-2 overflow-x-auto rounded-2xl border border-border-subtle bg-card p-2 shadow-sm">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`relative shrink-0 rounded-xl px-4 py-2 text-xs font-bold ${tab === item ? "bg-primary text-white" : "text-muted hover:bg-active"}`}
          >
            {item}
            {item === "Appointments" && newAppointments.length > 0 && (
              <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">
                {newAppointments.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {error && <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>}

      {tab === "Dashboard" && <FinanceDashboardTab overview={overview} loading={loading} />}
      {tab === "Invoices" && <InvoicesTab />}
      {tab === "Income" && <IncomeManagementTab income={overview?.income || []} loading={loading} onChanged={reload} />}
      {tab === "Income / Payments" && <IncomeTab payments={overview?.payments || []} loading={loading} />}
      {tab === "Outstanding Due" && <AdmissionsManagement />}
      {tab === "Expenses" && <ExpensesTab expenses={overview?.expenses || []} loading={loading} onChanged={reload} />}
      {tab === "Assets" && <AssetsTab />}
      {tab === "Transactions" && <TransactionsTab payments={overview?.payments || []} expenses={overview?.expenses || []} income={overview?.income || []} loading={loading} />}
      {tab === "Profit & Loss" && <ProfitLossTab />}
      {tab === "Appointments" && <AppointmentScheduler />}
      {tab === "Reports" && <ReportsTab />}
    </div>
  );
}
