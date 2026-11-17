"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, Download, ExternalLink, FileText, Inbox, Mail, MessageCircle,
  RefreshCw, Search, Send, UserRoundCheck, X, XCircle,
} from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { markAllNotificationsRead, useUnreadNotificationsByType } from "../../lib/notification-data";
import {
  approveRegistration,
  loadApprovalOptions,
  loadInvoicePdf,
  loadReceipt,
  loadRegistrations,
  rejectRegistration,
  sendRegistrationEmail,
} from "../../lib/services/training-registration-service";
import { formatPrice } from "../../lib/training-offer";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import { SkeletonList } from "../ui/Skeleton";

// Dashboard → Registrations (Admin / Director): requests sent from the
// homepage "Submit a Training Registration" form. Approve = enroll the
// trainee into a training batch (creating their student account when
// needed), optionally record the receipt as a payment, and email the
// confirmation + invoice PDF. Reject keeps the request with a reason.
const TABS = [
  ["pending", "Pending"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["all", "All"],
];
const STATUS_STYLE = {
  pending: "bg-warning-soft text-warning",
  approved: "bg-success-soft text-success",
  rejected: "bg-active text-primary",
};
const EMAIL_STYLE = {
  sent: "bg-success-soft text-success",
  failed: "bg-active text-primary",
  not_configured: "bg-warning-soft text-warning",
  skipped: "bg-page text-muted",
};
const EMAIL_LABEL = { sent: "Email sent", failed: "Email failed", not_configured: "Email not set up", skipped: "Email not sent" };
const inputClass = "mt-1 w-full rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary";

const fmtDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-SG", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
};
const waLink = (number) => `https://wa.me/${String(number || "").replace(/\D/g, "")}`;
const sgd = (value) => `S$${(Number(value) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function openBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function StatusBadge({ status }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold capitalize ${STATUS_STYLE[status] || STATUS_STYLE.pending}`}>{status}</span>;
}

function Detail({ label, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-ink">{children || "—"}</dd>
    </div>
  );
}

function PersonBlock({ title, person }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border-subtle bg-page/60 p-4">
      <h4 className="text-xs font-black uppercase tracking-wider text-muted">{title}</h4>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Detail label="Name">{person.name}</Detail>
        <Detail label="Title">{person.title}</Detail>
        <Detail label="Email">{person.email && <a href={`mailto:${person.email}`} className="text-info hover:underline">{person.email}</a>}</Detail>
        <Detail label="WhatsApp">{person.whatsapp && <a href={waLink(person.whatsapp)} target="_blank" rel="noreferrer" className="text-info hover:underline">{person.whatsapp}</a>}</Detail>
      </dl>
    </div>
  );
}

function ReceiptPanel({ registration }) {
  const toast = useToast();
  const [preview, setPreview] = useState(null); // { url, type }
  const [loading, setLoading] = useState(false);
  const receipt = registration.receipt;

  useEffect(() => () => { if (preview?.url) URL.revokeObjectURL(preview.url); }, [preview]);

  if (!receipt) return <p className="rounded-2xl border border-dashed border-border-subtle p-4 text-sm text-muted">No payment receipt was uploaded.</p>;

  async function show() {
    setLoading(true);
    try {
      const blob = await loadReceipt(registration.id);
      const type = blob.type || receipt.contentType;
      if (/^image\/(jpeg|png|webp|gif)$/.test(type)) setPreview({ url: URL.createObjectURL(blob), type });
      else openBlob(blob, receipt.name);
    } catch (err) {
      toast.error(err.message || "Unable to load the receipt.");
    } finally {
      setLoading(false);
    }
  }

  async function open() {
    try {
      openBlob(await loadReceipt(registration.id), receipt.name);
    } catch (err) {
      toast.error(err.message || "Unable to load the receipt.");
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border-subtle p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <b className="block truncate text-sm text-ink">{receipt.name}</b>
            <span className="text-[11px] text-muted">{receipt.contentType} · {Math.max(1, Math.round((receipt.size || 0) / 1024))} KB</span>
          </div>
        </div>
        <div className="flex gap-2">
          {!preview && (
            <button type="button" onClick={show} disabled={loading} className="rounded-xl bg-info px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
              {loading ? "Loading…" : "View receipt"}
            </button>
          )}
          <button type="button" onClick={open} className="inline-flex items-center gap-1 rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink hover:bg-active">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> Open
          </button>
        </div>
      </div>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview.url} alt="Payment receipt" className="max-h-[60vh] w-full rounded-xl border border-border-subtle bg-page object-contain" />
      )}
    </div>
  );
}

// Best guess at the batch for a course card: most shared title words,
// then the soonest upcoming start.
function rankBatches(batches, courseTitle) {
  const words = (courseTitle || "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2 && !["course", "training", "basic", "the"].includes(word));
  const today = new Date().toISOString().slice(0, 10);
  return batches
    .map((batch) => {
      const haystack = `${batch.title} ${batch.batchName} ${batch.category}`.toLowerCase();
      return { ...batch, score: words.filter((word) => haystack.includes(word)).length, upcoming: !batch.endDate || batch.endDate >= today };
    })
    .sort((a, b) => b.score - a.score || Number(b.upcoming) - Number(a.upcoming) || (a.startDate || "").localeCompare(b.startDate || ""));
}

function ApproveDialog({ registration, onClose, onDone }) {
  const toast = useToast();
  const [options, setOptions] = useState(null);
  const [error, setError] = useState("");
  const [courseId, setCourseId] = useState("");
  const [record, setRecord] = useState(Boolean(registration.receipt));
  const [amount, setAmount] = useState(String(registration.course?.price || ""));
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState(registration.ref || "");
  const [sendMail, setSendMail] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadApprovalOptions()
      .then((data) => {
        const ranked = rankBatches(data.batches || [], registration.course?.title);
        setOptions({ ...data, batches: ranked });
        if (ranked[0]?.score > 0) setCourseId(ranked[0].id);
        const methods = data.paymentMethods || [];
        setMethod(methods.includes("PayNow") ? "PayNow" : methods.includes("Bank Transfer") ? "Bank Transfer" : methods[0] || "");
        setSendMail(Boolean(data.emailConfigured));
      })
      .catch((err) => setError(err.message || "Unable to load training batches."));
  }, [registration.course?.title]);

  const batch = options?.batches.find((item) => item.id === courseId);
  const price = Number(registration.course?.price) || 0;
  const feeMismatch = batch && Math.abs(batch.fee - price) > 0.009;

  async function submit(event) {
    event.preventDefault();
    if (!courseId) return toast.error("Choose the training batch.");
    setSaving(true);
    try {
      const result = await approveRegistration(registration.id, {
        courseId,
        sendEmail: sendMail,
        ...(record ? { recordPayment: { amount: Number(amount), method, reference } } : {}),
      });
      toast.success(`Approved and enrolled into ${result.approval.batchTitle}.`);
      onDone(result);
    } catch (err) {
      toast.error(err.message || "Unable to approve.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Approve registration">
      <form onSubmit={submit} className="my-6 w-full max-w-lg space-y-4 rounded-3xl bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-black text-ink">Approve &amp; enroll</h3>
            <p className="text-xs text-muted">{registration.trainee?.name} · {registration.course?.title} ({formatPrice(price)})</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-page"><X className="h-5 w-5" /></button>
        </div>

        {error ? (
          <p className="rounded-xl bg-active px-4 py-3 text-sm text-primary">{error}</p>
        ) : !options ? (
          <p className="text-sm text-muted">Loading training batches…</p>
        ) : (
          <>
            <label className="block text-xs font-bold text-muted">Training batch
              <select required value={courseId} onChange={(event) => setCourseId(event.target.value)} className={inputClass}>
                <option value="">— Choose a batch —</option>
                {options.batches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {[item.title, item.batchName, item.startDate && `starts ${item.startDate}`, `fee ${sgd(item.fee)}`, item.status === "Draft" ? "Draft" : ""].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </label>
            {!options.batches.length && <p className="text-xs font-semibold text-warning">No open training batches. Create one under Training first.</p>}
            {feeMismatch && (
              <p className="flex gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                This batch&apos;s fee is {sgd(batch.fee)}, but the registration was for {sgd(price)}. The invoice uses the batch fee — change it under Training if needed.
              </p>
            )}
            <p className="text-[11px] text-muted">
              The trainee is matched by email ({registration.trainee?.email}). If no account exists, a Student account is created and the email includes a link to set a password.
            </p>

            <div className="space-y-3 rounded-2xl border border-border-subtle p-4">
              <label className="flex items-center gap-2 text-sm font-bold text-ink">
                <input type="checkbox" checked={record} onChange={(event) => setRecord(event.target.checked)} className="h-4 w-4 accent-[#e31b23]" />
                Record the payment from the receipt
              </label>
              {record && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-xs font-bold text-muted">Amount (S$)
                    <input required type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className={inputClass} />
                  </label>
                  <label className="block text-xs font-bold text-muted">Method
                    <select value={method} onChange={(event) => setMethod(event.target.value)} className={inputClass}>
                      {(options.paymentMethods || []).map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-bold text-muted">Reference
                    <input value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} className={inputClass} />
                  </label>
                </div>
              )}
              {!registration.receipt && !record && <p className="text-[11px] text-muted">No receipt was uploaded — the invoice will show the full amount as due.</p>}
            </div>

            <label className={`flex items-start gap-2 rounded-2xl border border-border-subtle p-4 text-sm ${options.emailConfigured ? "text-ink" : "text-muted"}`}>
              <input type="checkbox" checked={sendMail} disabled={!options.emailConfigured} onChange={(event) => setSendMail(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[#e31b23]" />
              <span>
                <b className="block">Email the confirmation and invoice PDF</b>
                <span className="text-xs">
                  {options.emailConfigured
                    ? `To ${registration.trainee?.email}${registration.requester?.email && registration.requester.email !== registration.trainee?.email ? `, cc ${registration.requester.email}` : ""}.`
                    : "Email is not set up on the server yet (Resend). You can send it later from this request once it is."}
                </span>
              </span>
            </label>
          </>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-4 py-2 text-sm font-bold text-muted">Cancel</button>
          <button disabled={saving || !options || !courseId} className="inline-flex items-center gap-2 rounded-xl bg-success px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
            <UserRoundCheck className="h-4 w-4" aria-hidden="true" /> {saving ? "Approving…" : "Approve & enroll"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ApprovalPanel({ registration, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const approval = registration.approval || {};
  const email = registration.email;

  async function downloadInvoice() {
    setBusy("invoice");
    try {
      openBlob(await loadInvoicePdf(approval.enrollmentId), `${approval.invoiceNumber || "invoice"}.pdf`);
    } catch (err) {
      toast.error(err.message || "Unable to load the invoice.");
    } finally {
      setBusy("");
    }
  }

  async function sendEmail() {
    setBusy("email");
    try {
      const { email: result } = await sendRegistrationEmail(registration.id);
      if (result.status === "sent") toast.success(result.message);
      else toast.error(result.message);
      onChanged();
    } catch (err) {
      toast.error(err.message || "Unable to send the email.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-success/30 bg-success-soft/40 p-4">
      <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Approved</h4>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Detail label="Training batch">{[approval.batchTitle, approval.batchName].filter(Boolean).join(" · ")}</Detail>
        <Detail label="Student">{approval.studentUserId ? `User ID ${approval.studentUserId}` : "Existing account"}{approval.accountCreated ? " · new account" : ""}</Detail>
        <Detail label="Invoice">{approval.invoiceNumber} · {sgd(approval.finalFee)}</Detail>
        <Detail label="Payment">
          {approval.payment?.recorded ? `${sgd(approval.payment.amount)} via ${approval.payment.method}` : approval.payment?.error ? `Not recorded — ${approval.payment.error}` : "Not recorded"}
        </Detail>
        <Detail label="Approved">{fmtDateTime(approval.approvedAt)}{approval.approvedByName ? ` by ${approval.approvedByName}` : ""}</Detail>
        <Detail label="Confirmation email">
          {email ? <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${EMAIL_STYLE[email.status] || EMAIL_STYLE.skipped}`}>{EMAIL_LABEL[email.status] || email.status}</span> : "Not sent"}
          {email?.message && <span className="mt-1 block text-xs font-normal text-muted">{email.message}{email.at ? ` (${fmtDateTime(email.at)})` : ""}</span>}
        </Detail>
      </dl>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={downloadInvoice} disabled={busy === "invoice"} className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> {busy === "invoice" ? "Preparing…" : "Invoice PDF"}
        </button>
        <button type="button" onClick={sendEmail} disabled={busy === "email"} className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs font-bold text-ink hover:bg-active disabled:opacity-60">
          <Send className="h-3.5 w-3.5" aria-hidden="true" /> {busy === "email" ? "Sending…" : email?.status === "sent" ? "Send email again" : "Send email"}
        </button>
      </div>
    </div>
  );
}

function RegistrationDetail({ registration, onClose, onChanged }) {
  const confirm = useConfirm();
  const toast = useToast();
  const [approving, setApproving] = useState(false);

  async function reject() {
    await confirm({
      title: "Reject this registration?",
      message: `${registration.trainee?.name}'s request for ${registration.course?.title} will be marked as rejected. Nothing is emailed.`,
      tone: "danger",
      confirmLabel: "Reject",
      input: { label: "Reason (optional, kept for your records)", multiline: true },
      onConfirm: async (reason) => {
        await rejectRegistration(registration.id, reason || "");
        toast.success("Registration rejected.");
        onChanged();
      },
    });
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="dialog" aria-modal="true" aria-label="Registration details" onMouseDown={(event) => { if (event.target === event.currentTarget && !approving) onClose(); }}>
      <div className="my-6 w-full max-w-2xl space-y-5 rounded-3xl bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-black text-ink">{registration.trainee?.name}</h3>
              <StatusBadge status={registration.status} />
            </div>
            <p className="text-xs text-muted"><span className="font-mono">{registration.ref}</span> · submitted {fmtDateTime(registration.createdAt)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-muted hover:bg-page"><X className="h-5 w-5" /></button>
        </div>

        <dl className="grid gap-3 rounded-2xl bg-page/60 p-4 sm:grid-cols-4">
          <Detail label="Course">{registration.course?.title}</Detail>
          <Detail label="Duration">{registration.course?.duration}</Detail>
          <Detail label="Schedule">{registration.course?.schedule}</Detail>
          <Detail label="Price">{formatPrice(registration.course?.price)}</Detail>
        </dl>

        <PersonBlock title="Trainee / student" person={registration.trainee || {}} />
        {registration.sameAsTrainee ? (
          <p className="rounded-2xl border border-border-subtle p-4 text-xs font-semibold text-muted">Requester / payer: same as the trainee.</p>
        ) : (
          <PersonBlock title="Requester / payer" person={registration.requester || {}} />
        )}
        <dl className="grid gap-3 sm:grid-cols-2">
          <Detail label="Company / organization">{registration.company}</Detail>
          <Detail label="Latest education">{registration.education}</Detail>
        </dl>

        <div className="space-y-2">
          <h4 className="text-xs font-black uppercase tracking-wider text-muted">Payment receipt</h4>
          <ReceiptPanel registration={registration} />
        </div>

        {registration.status === "approved" && <ApprovalPanel registration={registration} onChanged={onChanged} />}
        {registration.status === "rejected" && (
          <div className="space-y-1 rounded-2xl border border-primary/20 bg-active/60 p-4 text-sm">
            <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-primary"><XCircle className="h-4 w-4" aria-hidden="true" /> Rejected</h4>
            <p className="text-ink">{registration.rejection?.reason || "No reason given."}</p>
            <p className="text-xs text-muted">{fmtDateTime(registration.rejection?.rejectedAt)}{registration.rejection?.rejectedByName ? ` by ${registration.rejection.rejectedByName}` : ""}</p>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <a href={waLink(registration.trainee?.whatsapp)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink hover:bg-active">
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
          </a>
          <a href={`mailto:${registration.trainee?.email}`} className="inline-flex items-center gap-1.5 rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink hover:bg-active">
            <Mail className="h-3.5 w-3.5" aria-hidden="true" /> Email
          </a>
          {registration.status === "pending" && (
            <>
              <button type="button" onClick={reject} className="inline-flex items-center gap-1.5 rounded-xl bg-active px-4 py-2 text-xs font-bold text-primary hover:opacity-90">
                <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Reject
              </button>
              <button type="button" onClick={() => setApproving(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-success px-4 py-2 text-xs font-bold text-white hover:opacity-90">
                <UserRoundCheck className="h-3.5 w-3.5" aria-hidden="true" /> Approve &amp; enroll
              </button>
            </>
          )}
        </div>
      </div>
      {approving && (
        <ApproveDialog
          registration={registration}
          onClose={() => setApproving(false)}
          onDone={(result) => {
            setApproving(false);
            if (result.email?.status && result.email.status !== "sent" && result.email.status !== "skipped") toast.error(result.email.message);
            if (result.approval?.payment && !result.approval.payment.recorded) toast.error(`Payment not recorded: ${result.approval.payment.error}`);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

export default function TrainingRegistrations() {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [emailReady, setEmailReady] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("pending");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const unread = useUnreadNotificationsByType(user?.uid, "training-registration");
  const markedRef = useRef(new Set());

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await loadRegistrations();
      setRows(data.registrations || []);
      setEmailReady(Boolean(data.emailConfigured));
      setError("");
    } catch (err) {
      setError(err.message || "Unable to load registrations.");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  // Opening this page clears the sidebar badge (new-registration alerts).
  useEffect(() => {
    const fresh = unread.filter((item) => !markedRef.current.has(item.id));
    if (!fresh.length) return;
    fresh.forEach((item) => markedRef.current.add(item.id));
    markAllNotificationsRead(fresh).catch(() => {});
  }, [unread]);

  const counts = useMemo(() => {
    const out = { pending: 0, approved: 0, rejected: 0, all: rows?.length || 0 };
    (rows || []).forEach((row) => { out[row.status] = (out[row.status] || 0) + 1; });
    return out;
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (rows || [])
      .filter((row) => tab === "all" || row.status === tab)
      .filter((row) => {
        if (!needle) return true;
        return [row.ref, row.trainee?.name, row.trainee?.email, row.trainee?.whatsapp, row.requester?.name, row.requester?.email, row.company, row.course?.title, row.approval?.batchTitle]
          .some((value) => (value || "").toLowerCase().includes(needle));
      });
  }, [rows, tab, query]);

  const selected = rows?.find((row) => row.id === openId) || null;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-ink">Training registrations</h2>
          <p className="text-xs text-muted">Requests from the homepage “Submit a Training Registration” form. Approve to enroll into a batch and send the invoice.</p>
        </div>
        <button type="button" onClick={() => load().then(() => toast.success("Refreshed."))} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs font-bold text-ink hover:bg-active disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" /> Refresh
        </button>
      </div>

      {!emailReady && (
        <p className="flex gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-xs text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Confirmation emails are off: RESEND_API_KEY and RESEND_FROM_EMAIL are not set on the server. Approving still enrolls the trainee and creates the invoice; send the email from the request once email is set up.
        </p>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <nav className="flex flex-wrap gap-2 rounded-2xl border border-border-subtle bg-card p-2 shadow-sm">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === key ? "bg-primary text-white" : "text-muted hover:bg-active"}`}>
              {label} <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${tab === key ? "bg-white/25" : "bg-page"}`}>{counts[key] || 0}</span>
            </button>
          ))}
        </nav>
        <label className="relative block md:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, phone, course, ref…" className="w-full rounded-xl border border-border-subtle bg-card py-2.5 pl-9 pr-3 text-sm text-ink outline-none focus:ring-2 focus:ring-primary" />
        </label>
      </div>

      {error && <p className="rounded-xl bg-active px-4 py-3 text-sm text-primary">{error}</p>}
      {!rows && !error ? (
        <SkeletonList count={5} />
      ) : rows && !visible.length ? (
        <div className="grid place-items-center gap-2 rounded-3xl border border-dashed border-border-subtle bg-card p-10 text-center">
          <Inbox className="h-8 w-8 text-subtle" aria-hidden="true" />
          <p className="text-sm font-semibold text-muted">{query ? "No registrations match your search." : tab === "pending" ? "No pending registrations." : "Nothing here yet."}</p>
        </div>
      ) : rows ? (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-3xl border border-border-subtle bg-card shadow-sm">
          {visible.map((row) => (
            <li key={row.id}>
              <button type="button" onClick={() => setOpenId(row.id)} className="flex w-full flex-col gap-3 p-4 text-left transition hover:bg-page/70 sm:flex-row sm:items-center">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-active text-sm font-black text-primary">
                  {(row.trainee?.name || "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-ink">{row.trainee?.name}</b>
                  <span className="block truncate text-xs text-muted">{row.trainee?.email} · {row.trainee?.whatsapp}</span>
                </span>
                <span className="min-w-0 sm:w-56">
                  <b className="block truncate text-xs text-ink">{row.course?.title} · {formatPrice(row.course?.price)}</b>
                  <span className="block truncate text-[11px] text-muted">
                    {row.status === "approved" ? `→ ${row.approval?.batchTitle || "batch"}` : row.sameAsTrainee ? "Self-paid" : `Payer: ${row.requester?.name || "—"}`}
                  </span>
                </span>
                <span className="flex items-center gap-2 sm:w-52 sm:justify-end">
                  {row.receipt && <ClipboardCheck className="h-4 w-4 text-success" aria-label="Receipt uploaded" />}
                  {row.status === "approved" && row.email && row.email.status !== "sent" && <Mail className="h-4 w-4 text-warning" aria-label="Email not sent" />}
                  <span className="text-[11px] text-muted">{fmtDateTime(row.createdAt)}</span>
                  <StatusBadge status={row.status} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {selected && <RegistrationDetail key={selected.id} registration={selected} onClose={() => setOpenId("")} onChanged={load} />}
    </section>
  );
}
