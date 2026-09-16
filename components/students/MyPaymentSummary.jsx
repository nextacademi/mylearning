"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, MapPin } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { subscribeMyEnrollments, subscribeMyPayments, subscribeMyInvoices, getCachedEnrollments, getCachedPayments } from "../../lib/student-data";
import { subscribeMySessionsForClasses } from "../../lib/class-sessions-data";
import { loadUsersByIds } from "../../lib/training-detail";
import PaymentHistoryTable, { PaymentStatusBadge, formatMoney, formatDate } from "../training/PaymentHistoryTable";
import { downloadInvoicePdf } from "../../lib/services/finance-service";
import { downloadManualInvoicePdf } from "../../lib/services/invoice-service";
import { StatusBadge } from "../data-table/DataTable";
import { SkeletonBar } from "../ui/Skeleton";

// Perceived-speed only — mirrors the real enrollment section below (header
// + status badge + the 6-tile fee/paid/due grid + the "Payment History"
// button) so there's no layout jump once the real records arrive.
function PaymentSummarySkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 2 }).map((_, i) => (
        <section key={i} className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <SkeletonBar className="h-5 w-52" />
              <SkeletonBar className="h-3 w-36" />
            </div>
            <SkeletonBar className="h-6 w-20 rounded-full" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-page p-4 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, j) => (
              <div key={j} className="space-y-1.5">
                <SkeletonBar className="mx-auto h-2.5 w-14" />
                <SkeletonBar className="mx-auto h-4 w-12" />
              </div>
            ))}
          </div>
          <SkeletonBar className="mt-4 h-9 w-40 rounded-xl" />
        </section>
      ))}
    </div>
  );
}

function formatSessionDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

// A student's upcoming offline classes — real, pre-scheduled Class
// Sessions (see /api/class-sessions) for whichever classes they're
// actually enrolled in, never a fake schedule. Only shown here in the
// existing "My Training" view — no new student-facing page.
function UpcomingClasses({ enrollments }) {
  const classIds = useMemo(() => [...new Set(enrollments.map((item) => item.classId).filter(Boolean))], [enrollments]);
  const classIdsKey = classIds.join(",");
  const [sessions, setSessions] = useState([]);
  const [teacherNames, setTeacherNames] = useState(new Map());

  // eslint-disable-next-line react-hooks/exhaustive-deps -- classIdsKey is the stable, correctly-derived dependency for the classIds array above
  useEffect(() => subscribeMySessionsForClasses(classIds, setSessions, () => {}), [classIdsKey]);
  useEffect(() => {
    const ids = [...new Set(sessions.map((item) => item.teacherId).filter(Boolean))];
    if (!ids.length) return;
    let cancelled = false;
    loadUsersByIds(ids).then((rows) => {
      if (!cancelled) setTeacherNames(new Map(rows.map((row) => [row.id, row.displayName || row.email || row.id])));
    });
    return () => {
      cancelled = true;
    };
  }, [sessions]);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = sessions.filter((item) => item.date >= today && item.status !== "cancelled");
  const courseTitleFor = (classId) => enrollments.find((item) => item.classId === classId)?.courseTitle || "Training";

  if (!upcoming.length) return null;
  return (
    <div className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm">
      <h3 className="mb-3 text-sm font-bold text-ink">Upcoming Class{upcoming.length > 1 ? "es" : ""}</h3>
      <div className="space-y-2">
        {upcoming.map((session) => (
          <div key={session.id} className="rounded-xl bg-page p-3 text-xs">
            <b className="block text-ink">{courseTitleFor(session.classId)} — {session.title}</b>
            <span className="mt-1 flex flex-wrap items-center gap-3 text-muted">
              <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" aria-hidden="true" /> {formatSessionDate(session.date)}{session.startTime && session.endTime ? ` · ${session.startTime}–${session.endTime}` : ""}</span>
              {session.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" /> {session.location}</span>}
            </span>
            {session.teacherId && <span className="mt-1 block text-muted">Teacher: {teacherNames.get(session.teacherId) || "—"}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Manual (non-enrollment) invoices — Registration/Material/Exam Fee etc.
// Course-fee invoices keep rendering above exactly as before; this is only
// the other kind, view-only (no "Record Payment" — that stays an
// Admin/Director action, same as course-fee payments).
function OtherInvoices({ invoices }) {
  const [openingId, setOpeningId] = useState("");
  if (!invoices.length) return null;

  async function open(invoice) {
    setOpeningId(invoice.id);
    try {
      const blob = await downloadManualInvoicePdf(invoice.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } finally {
      setOpeningId("");
    }
  }

  return (
    <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
      <h3 className="mb-3 text-sm font-bold text-ink">Other Invoices</h3>
      <div className="space-y-2">
        {invoices.map((invoice) => (
          <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle p-3">
            <div className="min-w-0">
              <b className="block text-sm text-ink">{invoice.description || invoice.invoiceType}</b>
              <span className="font-mono text-[11px] text-subtle">{invoice.invoiceNumber}</span>
              <span className="ml-2 text-[11px] text-muted">{formatDate(invoice.issueDate)} · {formatMoney(invoice.totalAmount)} · Due {formatMoney(invoice.dueAmount)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge tone={invoice.status === "Paid" ? "green" : invoice.status === "Cancelled" ? "gray" : invoice.status === "Partial" ? "purple" : "orange"}>{invoice.status}</StatusBadge>
              <button type="button" disabled={openingId === invoice.id} onClick={() => open(invoice)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-[11px] font-bold text-ink hover:bg-active disabled:opacity-50">
                {openingId === invoice.id ? "Preparing…" : "View / Download"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// Read-only by design: a Student can view their own admission/payment
// summary and history, but there is no edit/delete affordance anywhere in
// this component — collecting or changing a payment only ever happens
// through Director/Admin's EnrollmentManager, enforced server-side by the
// /api/admin/payments route and by Firestore rules (payments: write: admin()).
export default function MyPaymentSummary() {
  const { user } = useAuth();
  // Seeded from prefetchMyTraining's cache (app/dashboard/[role]/page.jsx
  // fires it the moment the dashboard mounts) when present, so a Student
  // who already waited through the dashboard's own load sees this tab
  // populated instantly instead of a second "Loading..." — the effect
  // below still establishes this component's own live subscription
  // either way, so data stays fresh regardless of whether the cache had
  // anything yet.
  const [enrollments, setEnrollments] = useState(() => getCachedEnrollments(user?.uid) || []);
  const [payments, setPayments] = useState(() => getCachedPayments(user?.uid));
  const [manualInvoices, setManualInvoices] = useState([]);
  const [loading, setLoading] = useState(() => !getCachedEnrollments(user?.uid));
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [invoiceDownloadingId, setInvoiceDownloadingId] = useState("");
  const [invoiceError, setInvoiceError] = useState({ id: "", message: "" });

  // The invoice PDF route (app/api/admin/enrollments/[id]/invoice) has
  // always allowed the enrollment's own student, same as the Receipt
  // download below — it just had no button on the student side until now.
  async function downloadInvoice(enrollment) {
    setInvoiceDownloadingId(enrollment.id);
    setInvoiceError({ id: "", message: "" });
    try {
      const blob = await downloadInvoicePdf(enrollment.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setInvoiceError({ id: enrollment.id, message: err.message || "Unable to download this invoice." });
    } finally {
      setInvoiceDownloadingId("");
    }
  }

  useEffect(() => {
    if (!user?.uid) return undefined;
    const unsubEnrollments = subscribeMyEnrollments(
      user.uid,
      (rows) => {
        setEnrollments(rows);
        setLoading(false);
      },
      () => {
        // Without this the page got stuck on "Loading..." forever on any
        // query error — the error branch below was unreachable because the
        // `if (loading)` check always ran first and `loading` never
        // flipped back to false.
        setError("Unable to load your training records.");
        setLoading(false);
      },
    );
    const unsubPayments = subscribeMyPayments(user.uid, setPayments, () => {});
    const unsubInvoices = subscribeMyInvoices(user.uid, setManualInvoices, () => {});
    return () => {
      unsubEnrollments();
      unsubPayments();
      unsubInvoices();
    };
  }, [user?.uid]);

  if (loading) {
    return <PaymentSummarySkeleton />;
  }
  if (error) {
    return <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>;
  }
  if (!enrollments.length && !manualInvoices.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border-subtle bg-card p-8 text-center text-sm text-muted">
        You are not enrolled in any offline training yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <UpcomingClasses enrollments={enrollments} />
      {enrollments.map((enrollment) => {
        const trainingFee = Number(enrollment.trainingFee) || 0;
        const discount = Number(enrollment.discount) || 0;
        const finalFee = Number(enrollment.finalFee) || 0;
        const totalPaid = Number(enrollment.totalPaid) || 0;
        const dueAmount = Number.isFinite(enrollment.dueAmount) ? enrollment.dueAmount : Math.max(0, finalFee - totalPaid);
        const paymentStatus = enrollment.paymentStatus || "Unpaid";
        const expanded = expandedId === enrollment.id;
        const myPaymentsForThis = payments.filter((item) => item.enrollmentId === enrollment.id);

        return (
          <section key={enrollment.id} className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-ink">{enrollment.courseTitle}</h3>
                <p className="text-xs text-muted">Offline Training · {enrollment.courseCode}</p>
              </div>
              <PaymentStatusBadge value={paymentStatus} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-page p-4 text-center sm:grid-cols-3 lg:grid-cols-6">
              <div><p className="text-[10px] font-bold uppercase text-subtle">Training Fee</p><p className="mt-1 text-sm font-bold text-ink">{formatMoney(trainingFee)}</p></div>
              <div><p className="text-[10px] font-bold uppercase text-subtle">Discount</p><p className="mt-1 text-sm font-bold text-ink">{formatMoney(discount)}</p></div>
              <div><p className="text-[10px] font-bold uppercase text-subtle">Final Fee</p><p className="mt-1 text-sm font-bold text-ink">{formatMoney(finalFee)}</p></div>
              <div><p className="text-[10px] font-bold uppercase text-subtle">Paid</p><p className="mt-1 text-sm font-bold text-success">{formatMoney(totalPaid)}</p></div>
              <div><p className="text-[10px] font-bold uppercase text-subtle">Due</p><p className="mt-1 text-sm font-bold text-primary">{formatMoney(dueAmount)}</p></div>
              <div><p className="text-[10px] font-bold uppercase text-subtle">Status</p><p className="mt-1"><PaymentStatusBadge value={paymentStatus} /></p></div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : enrollment.id)}
                className="rounded-xl border border-border-subtle px-4 py-2 text-xs font-bold text-ink hover:bg-active hover:text-primary"
              >
                {expanded ? "Hide Payment History" : "Payment History"}
              </button>
              <button
                type="button"
                disabled={invoiceDownloadingId === enrollment.id}
                onClick={() => downloadInvoice(enrollment)}
                className="rounded-xl border border-border-subtle px-4 py-2 text-xs font-bold text-ink hover:bg-active hover:text-primary disabled:opacity-50"
              >
                {invoiceDownloadingId === enrollment.id ? "Preparing…" : "Download Invoice"}
              </button>
            </div>
            {invoiceError.id === enrollment.id && <p className="mt-2 text-xs text-primary">{invoiceError.message}</p>}
            {expanded && (
              <div className="mt-4">
                <PaymentHistoryTable
                  payments={myPaymentsForThis}
                  studentName={user?.displayName || user?.email}
                  courseTitle={enrollment.courseTitle}
                  courseCode={enrollment.courseCode}
                  finalFee={finalFee}
                />
              </div>
            )}
          </section>
        );
      })}
      <OtherInvoices invoices={manualInvoices} />
    </div>
  );
}
