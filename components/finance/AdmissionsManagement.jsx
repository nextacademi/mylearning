"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, CircleAlert, CircleDollarSign, Receipt, Users, Wallet } from "lucide-react";
import { loadAdmissions } from "../../lib/services/payment-service";
import { downloadInvoicePdf } from "../../lib/services/finance-service";
import { PaymentStatusBadge, formatDate, formatMoney } from "../training/PaymentHistoryTable";
import StatCard from "./StatCard";
import DataTable from "../data-table/DataTable";

// Cross-training admissions/finance view for Director/Admin. Read-only here
// by design — "View"/"Collect Payment" deep-link into the training's own
// Students tab (components/training/EnrollmentManager.jsx), which already
// has the real payment-collection UI. Keeping the actual money-moving
// action in one place avoids a second, divergent payment flow.
export default function AdmissionsManagement() {
  const [admissions, setAdmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadAdmissions()
      .then((result) => {
        if (!cancelled) setAdmissions(result.admissions);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Unable to load admissions.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [downloadingId, setDownloadingId] = useState("");
  const [downloadError, setDownloadError] = useState("");

  async function downloadInvoice(item) {
    setDownloadingId(item.enrollmentId);
    setDownloadError("");
    try {
      const blob = await downloadInvoicePdf(item.enrollmentId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setDownloadError(err.message || "Unable to download this invoice.");
    } finally {
      setDownloadingId("");
    }
  }

  const columns = useMemo(() => [
    { key: "invoiceNumber", header: "Invoice", sortable: true, accessor: (a) => a.invoiceNumber || "", render: (a) => <span className="font-mono text-xs text-muted">{a.invoiceNumber}</span> },
    { key: "studentName", header: "Student", sortable: true, accessor: (a) => `${a.studentName || ""} ${a.userId || ""}`, render: (a) => <span><b className="block text-ink">{a.studentName}</b><span className="text-[11px] text-muted">{a.userId}</span></span>, exportValue: (a) => a.studentName || "" },
    { key: "courseTitle", header: "Training", sortable: true, filter: {}, accessor: (a) => a.courseTitle || "", render: (a) => <span><b className="block text-ink">{a.courseTitle}</b><span className="font-mono text-[11px] text-muted">{a.courseCode}</span></span> },
    { key: "trainingFee", header: "Total Fee", align: "right", sortable: true, accessor: (a) => Number(a.trainingFee || 0), render: (a) => <span className="text-xs text-muted">{formatMoney(a.trainingFee)}</span>, exportValue: (a) => Number(a.trainingFee || 0) },
    { key: "discount", header: "Discount", align: "right", accessor: (a) => Number(a.discount || 0), render: (a) => <span className="text-xs text-muted">{formatMoney(a.discount)}</span>, exportValue: (a) => Number(a.discount || 0) },
    { key: "finalFee", header: "Final Fee", align: "right", sortable: true, accessor: (a) => Number(a.finalFee || 0), render: (a) => <b className="text-ink">{formatMoney(a.finalFee)}</b>, exportValue: (a) => Number(a.finalFee || 0) },
    { key: "totalPaid", header: "Total Paid", align: "right", sortable: true, accessor: (a) => Number(a.totalPaid || 0), render: (a) => <b className="text-success">{formatMoney(a.totalPaid)}</b>, exportValue: (a) => Number(a.totalPaid || 0) },
    { key: "dueAmount", header: "Outstanding Due", align: "right", sortable: true, accessor: (a) => Number(a.dueAmount || 0), render: (a) => <b className="text-primary">{formatMoney(a.dueAmount)}</b>, exportValue: (a) => Number(a.dueAmount || 0) },
    { key: "paymentStatus", header: "Payment Status", sortable: true, filter: {}, accessor: (a) => a.paymentStatus || "", render: (a) => <PaymentStatusBadge value={a.paymentStatus} /> },
    { key: "admissionDate", header: "Admission Date", sortable: true, accessor: (a) => a.admissionDate || "", exportValue: (a) => a.admissionDate || "", render: (a) => <span className="text-xs text-muted">{formatDate(a.admissionDate)}</span> },
  ], []);

  const summary = useMemo(
    () => ({
      total: admissions.length,
      collected: admissions.reduce((sum, item) => sum + (Number(item.totalPaid) || 0), 0),
      due: admissions.reduce((sum, item) => sum + (Number(item.dueAmount) || 0), 0),
      paid: admissions.filter((item) => item.paymentStatus === "Paid").length,
      partial: admissions.filter((item) => item.paymentStatus === "Partial").length,
      unpaid: admissions.filter((item) => item.paymentStatus === "Unpaid").length,
    }),
    [admissions],
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 text-ink shadow-xl">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Finance</p>
          <h2 className="mt-2 text-3xl font-black">Admissions</h2>
          <p className="mt-2 text-sm text-muted">Track admission fees, payments collected, and outstanding dues across every training.</p>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Total Admissions" value={summary.total} loading={loading} icon={Users} iconBg="bg-info-soft" iconColor="text-info" />
        <StatCard label="Collected" value={summary.collected} format={formatMoney} loading={loading} icon={Wallet} iconBg="bg-success-soft" iconColor="text-success" valueColor="text-success" />
        <StatCard label="Outstanding Due" value={summary.due} format={formatMoney} loading={loading} icon={Receipt} iconBg="bg-warning-soft" iconColor="text-warning" valueColor="text-warning" />
        <StatCard label="Paid Admissions" value={summary.paid} loading={loading} icon={BadgeCheck} iconBg="bg-success-soft" iconColor="text-success" valueColor="text-success" />
        <StatCard label="Partial Admissions" value={summary.partial} loading={loading} icon={CircleDollarSign} iconBg="bg-purple-soft" iconColor="text-purple" />
        <StatCard label="Unpaid Admissions" value={summary.unpaid} loading={loading} icon={CircleAlert} iconBg="bg-active" iconColor="text-primary" valueColor="text-primary" />
      </section>

      <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
        {error && <p className="mb-3 rounded-xl bg-active p-3 text-xs text-primary">{error}</p>}
        {downloadError && <p className="mb-3 rounded-xl bg-active p-3 text-xs text-primary">{downloadError}</p>}
        <DataTable
          title="admissions"
          name="admissions-outstanding-due"
          columns={columns}
          rows={admissions}
          loading={loading}
          getRowId={(a) => a.enrollmentId}
          initialSort={{ key: "admissionDate", dir: "desc" }}
          pageSize={10}
          emptyLabel="No admissions recorded yet."
          rowActions={(item) => (
            <>
              <Link href={`/dashboard/training/${item.courseId}`} className="rounded-lg bg-info px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90">View</Link>
              <button
                type="button"
                onClick={() => downloadInvoice(item)}
                disabled={downloadingId === item.enrollmentId}
                className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-page disabled:opacity-60"
              >
                {downloadingId === item.enrollmentId ? "Preparing…" : "Invoice"}
              </button>
            </>
          )}
        />
      </section>
    </div>
  );
}
