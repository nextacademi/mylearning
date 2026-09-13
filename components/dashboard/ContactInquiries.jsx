"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, Inbox, Mail } from "lucide-react";
import { subscribeInquiries, updateInquiryStatus } from "../../lib/contact-inquiries-data";

const dash = "—";
const FILTERS = ["All", "New", "Read", "Replied", "Closed"];

function Dialog({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="text-xl text-muted" aria-label="Close dialog">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    new: "bg-active text-primary ring-red-line",
    read: "bg-info-soft text-info ring-info",
    replied: "bg-success-soft text-success ring-success",
    closed: "bg-page text-muted ring-border-subtle",
  };
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : "New";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${colors[status] || colors.new}`}>
      {label}
    </span>
  );
}

function displayDate(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date) return dash;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

// Shared by the row "View" action and the detail dialog — same fields
// either way (Name, Email, Role, Topic, Message, Submitted, Status).
function InquiryDetails({ inquiry }) {
  const rows = [
    ["Name", inquiry.name],
    ["Email", inquiry.email],
    ["Role / User Type", inquiry.role],
    ["Inquiry Topic", inquiry.topic],
    ["Submitted", displayDate(inquiry.createdAt)],
  ];
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <StatusBadge status={inquiry.status} />
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</dt>
            <dd className="mt-1 break-words font-medium text-muted">{value || dash}</dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Message</p>
        <p className="mt-2 whitespace-pre-wrap rounded-xl bg-page p-4 text-sm leading-6 text-ink">
          {inquiry.message || dash}
        </p>
      </div>
    </div>
  );
}

export default function ContactInquiries() {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");
  const [viewing, setViewing] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeInquiries(
      (data) => {
        setInquiries(data);
        setLoading(false);
        setError("");
      },
      () => {
        setLoading(false);
        setError("Unable to load contact inquiries. Please try again.");
      },
    );
    return unsubscribe;
  }, []);

  const newCount = useMemo(() => inquiries.filter((item) => (item.status || "new") === "new").length, [inquiries]);
  const visible = useMemo(
    () =>
      filter === "All"
        ? inquiries
        : inquiries.filter((item) => (item.status || "new") === filter.toLowerCase()),
    [inquiries, filter],
  );

  // Opening an inquiry always marks it Read (if it was still New) — matches
  // "if already read, do not increase the new counter" by simply never
  // re-marking an already-read/replied/closed inquiry back to new.
  async function openInquiry(inquiry) {
    setViewing(inquiry);
    if ((inquiry.status || "new") === "new") {
      await changeStatus(inquiry, "read", { silent: true });
    }
  }

  async function changeStatus(inquiry, status, { silent = false } = {}) {
    setUpdatingId(inquiry.id);
    try {
      await updateInquiryStatus(inquiry.id, status);
      if (!silent) setViewing((current) => (current?.id === inquiry.id ? { ...current, status } : current));
    } catch {
      if (!silent) setError("Unable to update this inquiry's status. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 text-ink shadow-xl">
        <div>
          <h2 className="text-3xl font-black">Contact Inquiries</h2>
          <p className="mt-2 text-sm text-muted">
            Manage messages and inquiries received from website visitors.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {newCount > 0 && (
            <span className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white">
              {newCount} New
            </span>
          )}
          <div className="rounded-2xl bg-active p-3">
            <Mail className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl bg-active px-4 py-3 text-sm text-primary">{error}</div>
      )}

      <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
        <div className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item}
              onClick={() => setFilter(item)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === item ? "bg-primary text-white" : "bg-page text-muted hover:bg-active hover:text-primary"}`}
            >
              {item}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted">Loading inquiries...</p>
        ) : !visible.length ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <Inbox className="h-10 w-10 text-subtle" aria-hidden="true" />
            <p className="text-sm text-muted">
              {filter === "All" ? "No contact inquiries yet." : `No ${filter.toLowerCase()} inquiries.`}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="border-b text-[10px] uppercase tracking-wider text-subtle">
                  <tr>
                    {["Name", "Email", "Role", "Topic", "Message", "Submitted", "Status", "Actions"].map((label) => (
                      <th key={label} className="p-3">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((inquiry) => (
                    <tr key={inquiry.id} className="border-b border-border-subtle align-middle">
                      <td className="p-3 font-semibold text-ink">{inquiry.name || dash}</td>
                      <td className="p-3 text-muted">{inquiry.email || dash}</td>
                      <td className="p-3 text-muted">{inquiry.role || dash}</td>
                      <td className="p-3 text-muted">{inquiry.topic || dash}</td>
                      <td className="max-w-64 truncate p-3 text-muted" title={inquiry.message}>
                        {inquiry.message || dash}
                      </td>
                      <td className="whitespace-nowrap p-3 text-muted">{displayDate(inquiry.createdAt)}</td>
                      <td className="p-3"><StatusBadge status={inquiry.status} /></td>
                      <td className="space-x-3 whitespace-nowrap p-3 text-xs font-bold">
                        <button onClick={() => openInquiry(inquiry)} className="inline-flex items-center gap-1 text-muted hover:text-primary">
                          <Eye className="h-3.5 w-3.5" />View
                        </button>
                        {(inquiry.status || "new") === "new" && (
                          <button disabled={updatingId === inquiry.id} onClick={() => changeStatus(inquiry, "read")} className="text-info hover:underline disabled:opacity-50">
                            Mark as Read
                          </button>
                        )}
                        {(inquiry.status || "new") !== "replied" && inquiry.status !== "closed" && (
                          <button disabled={updatingId === inquiry.id} onClick={() => changeStatus(inquiry, "replied")} className="text-success hover:underline disabled:opacity-50">
                            Mark as Replied
                          </button>
                        )}
                        {inquiry.status !== "closed" && (
                          <button disabled={updatingId === inquiry.id} onClick={() => changeStatus(inquiry, "closed")} className="text-primary hover:underline disabled:opacity-50">
                            Close
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile / tablet cards */}
            <div className="grid gap-4 lg:hidden">
              {visible.map((inquiry) => (
                <article key={inquiry.id} className="rounded-2xl border border-border-subtle p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{inquiry.name || dash}</p>
                      <p className="truncate text-xs text-muted">{inquiry.email || dash}</p>
                    </div>
                    <StatusBadge status={inquiry.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider text-subtle">
                    <span className="rounded-full bg-page px-2 py-1">{inquiry.role || dash}</span>
                    <span className="rounded-full bg-page px-2 py-1">{inquiry.topic || dash}</span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-muted">{inquiry.message}</p>
                  <p className="mt-2 text-[10px] text-subtle">{displayDate(inquiry.createdAt)}</p>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs font-bold">
                    <button onClick={() => openInquiry(inquiry)} className="inline-flex items-center gap-1 text-muted hover:text-primary">
                      <Eye className="h-3.5 w-3.5" />View
                    </button>
                    {(inquiry.status || "new") === "new" && (
                      <button disabled={updatingId === inquiry.id} onClick={() => changeStatus(inquiry, "read")} className="text-info disabled:opacity-50">
                        Mark as Read
                      </button>
                    )}
                    {(inquiry.status || "new") !== "replied" && inquiry.status !== "closed" && (
                      <button disabled={updatingId === inquiry.id} onClick={() => changeStatus(inquiry, "replied")} className="text-success disabled:opacity-50">
                        Mark as Replied
                      </button>
                    )}
                    {inquiry.status !== "closed" && (
                      <button disabled={updatingId === inquiry.id} onClick={() => changeStatus(inquiry, "closed")} className="text-primary disabled:opacity-50">
                        Close
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {viewing && (
        <Dialog title="Inquiry details" onClose={() => setViewing(null)}>
          <InquiryDetails inquiry={viewing} />
          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-border-subtle pt-5">
            {(viewing.status || "new") === "new" && (
              <button disabled={updatingId === viewing.id} onClick={() => changeStatus(viewing, "read")} className="rounded-xl border border-border-subtle px-4 py-2 text-sm font-bold text-info disabled:opacity-50">
                Mark as Read
              </button>
            )}
            {viewing.status !== "replied" && viewing.status !== "closed" && (
              <button disabled={updatingId === viewing.id} onClick={() => changeStatus(viewing, "replied")} className="rounded-xl border border-border-subtle px-4 py-2 text-sm font-bold text-success disabled:opacity-50">
                Mark as Replied
              </button>
            )}
            {viewing.status !== "closed" && (
              <button disabled={updatingId === viewing.id} onClick={() => changeStatus(viewing, "closed")} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                Close
              </button>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
