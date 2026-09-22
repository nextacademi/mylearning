"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Eye, MoreVertical, Trash2 } from "lucide-react";
import { changeUserRole, deleteUserAccount, loadUsersCached } from "../../lib/services/user-service";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import DataTable, { StatusBadge } from "../data-table/DataTable";
import { SkeletonBar, SkeletonList } from "../ui/Skeleton";
import StudentManagement from "../StudentManagement";
import TeacherAssignment from "../teacher-assignment/TeacherAssignment";

// "Students" and "Teacher" used to be their own sidebar items; consolidated
// here as sub-tabs so "User" is the one place Director/Admin manage every
// person in the academy. Each tab renders the exact same, already-working
// component those sidebar items used to point at — nothing about student/
// teacher management itself changed, only where it's reached from.
const USER_TABS = ["All Users", "Students", "Teachers"];

const assignableRoles = ["Student", "Teacher", "Admin", "Director"];
const dash = "—";
const ROLE_TONE = { Director: "purple", Admin: "red", Teacher: "blue", Student: "green", Guest: "orange" };

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

function displayDate(value) {
  if (!value) return dash;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? dash : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

// The three-dot secondary-actions menu — currently just Delete, kept
// behind a menu (rather than a third always-visible button) since it's the
// one destructive, rarely-used action on this row.
function RowMenu({ onDelete }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onClick(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="More actions" className="rounded-lg p-1.5 text-muted hover:bg-page hover:text-ink">
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 w-44 rounded-xl border border-border-subtle bg-card p-1 shadow-2xl">
          <button
            type="button"
            onClick={() => { setOpen(false); onDelete(); }}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-semibold text-primary hover:bg-active"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete account
          </button>
        </div>
      )}
    </div>
  );
}

function UserDetails({ user }) {
  const rows = [["User ID", user.userId || dash], ["Name", user.displayName], ["Email", user.email], ["Phone", user.phone], ["Role", user.role], ["Status", user.active === null ? null : user.active ? "Active" : "Inactive"], ["Joined", displayDate(user.createdAt)]];
  return <dl className="grid gap-4 text-sm">{rows.map(([label, value]) => <div key={label}><dt className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</dt><dd className="mt-1 break-all font-medium text-muted">{value || dash}</dd></div>)}</dl>;
}

export default function UserManagement({ role, currentUserId, onNavigate }) {
  const [tab, setTab] = useState("All Users");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [viewing, setViewing] = useState(null);
  const [changing, setChanging] = useState(null);
  const [nextRole, setNextRole] = useState("");
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  async function load({ force = false } = {}) {
    setLoading(true);
    try {
      const data = await loadUsersCached({ force });
      setUsers(data.users || []);
      setError("");
    } catch (loadError) {
      setUsers([]);
      setError(loadError.message || "Unable to load users. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void Promise.resolve().then(load); }, []);

  const counts = useMemo(() => Object.fromEntries(["Director", "Admin", "Teacher", "Student", "Guest"].map((item) => [item, users.filter((user) => user.role === item).length])), [users]);
  const canChange = (user) => user.uid !== currentUserId && !(role !== "Director" && user.role === "Director");

  const columns = useMemo(() => [
    { key: "userId", header: "User ID", sortable: true, accessor: (u) => u.userId || "", render: (u) => <span className="font-mono text-xs text-muted">{u.userId || dash}</span> },
    { key: "displayName", header: "Name", sortable: true, accessor: (u) => u.displayName || "", render: (u) => <b className="text-ink">{u.displayName || dash}</b> },
    { key: "email", header: "Email", sortable: true, accessor: (u) => u.email || "" },
    { key: "phone", header: "Phone", accessor: (u) => u.phone || "" },
    { key: "role", header: "Role", sortable: true, filter: {}, accessor: (u) => u.role || "", render: (u) => <StatusBadge tone={ROLE_TONE[u.role] || "gray"}>{u.role || dash}</StatusBadge> },
    { key: "status", header: "Status", sortable: true, filter: {}, accessor: (u) => (u.active === null ? "Unknown" : u.active ? "Active" : "Inactive"), render: (u) => <StatusBadge tone={u.active === false ? "gray" : "green"}>{u.active === null ? dash : u.active ? "Active" : "Inactive"}</StatusBadge> },
    { key: "createdAt", header: "Joined", sortable: true, sortValue: (u) => u.createdAt || "", exportValue: (u) => displayDate(u.createdAt), render: (u) => <span className="text-xs text-muted">{displayDate(u.createdAt)}</span> },
  ], []);

  function deleteUser(user) {
    const label = user.email || user.displayName || user.uid;
    return confirm({
      title: "Delete user account",
      message: `This permanently deletes ${user.displayName || user.email || user.uid}'s sign-in and profile — they will no longer be able to sign in. Their historical records (enrollments, attendance, certificates, etc.) are kept, not deleted. This cannot be undone.`,
      tone: "danger",
      confirmLabel: "Delete permanently",
      input: { label: `Type "${label}" to confirm`, placeholder: label },
      onConfirm: async (typed) => {
        if ((typed || "").trim() !== label) throw new Error(`Type "${label}" exactly to confirm deletion.`);
        await deleteUserAccount(user.uid);
        toast.success("User account deleted.");
        await load({ force: true });
      },
    });
  }

  async function updateRole(event) {
    event.preventDefault();
    if (!changing || !assignableRoles.includes(nextRole)) return;
    setSaving(true);
    try {
      await changeUserRole(changing.uid, nextRole);
      setChanging(null);
      setNotice("User role updated successfully.");
      await load({ force: true });
    } catch (updateError) {
      setError(updateError.message || "Unable to update the user role.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-6">
    <nav className="flex flex-wrap gap-2 overflow-x-auto rounded-2xl border border-border-subtle bg-card p-2 shadow-sm">
      {USER_TABS.map((item) => (
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

    {tab === "Students" && <StudentManagement role={role} />}
    {tab === "Teachers" && <TeacherAssignment onNavigate={onNavigate} />}
    {tab === "All Users" && (
      <>
        {notice && <p className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success">{notice}</p>}
        {error && !changing && <div className="rounded-xl bg-active px-4 py-3 text-sm text-primary"><b>Unable to load users. Please try again.</b><p>{error}</p></div>}
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{[["Total Users", users.length], ["Directors", counts.Director], ["Admins", counts.Admin], ["Teachers", counts.Teacher], ["Students", counts.Student], ["Guests", counts.Guest]].map(([label, value]) => <article key={label} className="rounded-2xl border border-border-subtle/70 bg-card p-5 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</p>{loading ? <SkeletonBar className="mt-2 h-7 w-12" /> : <p className="mt-2 text-2xl font-extrabold text-ink">{value}</p>}</article>)}</section>
        <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
          <div className="mb-4"><h3 className="font-bold text-ink">All Users</h3><p className="mt-1 text-xs text-muted">Search by user ID, name, email, or phone · filter by role or status · export the current view.</p></div>
          {loading ? (
            <SkeletonList count={8} />
          ) : (
            <DataTable
              title="users"
              name="users"
              columns={columns}
              rows={users}
              loading={loading}
              initialSort={{ key: "createdAt", dir: "desc" }}
              pageSize={10}
              emptyLabel="No users found."
              rowActions={(user) => (
                <>
                  <button type="button" onClick={() => setViewing(user)} className="inline-flex items-center gap-1 rounded-lg bg-info px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90"><Eye className="h-3.5 w-3.5" /> View</button>
                  {canChange(user) && <button type="button" onClick={() => { setChanging(user); setNextRole(user.role); setError(""); }} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-page">Change role</button>}
                  {canChange(user) && <RowMenu onDelete={() => deleteUser(user)} />}
                </>
              )}
            />
          )}
        </section>
      </>
    )}
    {viewing && <Dialog title="User details" onClose={() => setViewing(null)}><UserDetails user={viewing} /></Dialog>}
    {changing && <Dialog title="Change user role" onClose={() => !saving && setChanging(null)}><form onSubmit={updateRole} className="space-y-5"><p className="text-sm text-muted">Change the role for <b>{changing.displayName || changing.email || changing.uid}</b>. This takes effect immediately after confirmation.</p><label className="block text-sm font-semibold text-muted">Role<select value={nextRole} onChange={(event) => setNextRole(event.target.value)} className="mt-2 w-full rounded-xl border border-border-subtle bg-card px-3 py-2.5 font-normal outline-none focus:ring-2 focus:ring-primary">{assignableRoles.filter((item) => role === "Director" || item !== "Director").map((item) => <option key={item} value={item}>{item}</option>)}</select></label>{error && <p className="rounded-xl bg-active px-3 py-2 text-sm text-primary">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={() => setChanging(null)} disabled={saving} className="rounded-xl px-4 py-2 text-sm font-bold text-muted">Cancel</button><button disabled={saving || !canChange(changing)} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? "Updating role..." : "Confirm role change"}</button></div></form></Dialog>}
  </div>;
}
