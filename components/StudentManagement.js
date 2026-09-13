"use client";
import { useMemo, useState, useEffect } from "react";
import { GraduationCap, UserCheck, UserMinus, UserX, Users } from "lucide-react";
import { createStudent, loadStudentDirectory, updateStudent } from "../lib/services/student-service";
import StatCard from "./finance/StatCard";
import StudentTable from "./students/StudentTable";
import StudentForm from "./students/StudentForm";
import StudentDetails from "./students/StudentDetails";
import WordImportModal from "./word-import/WordImportModal";
import { useToast } from "./ui/Toast";
import { useConfirm } from "./ui/ConfirmDialog";

const genPassword = () => `${Math.random().toString(36).slice(2, 8)}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const blank = { displayName: "", email: "", phone: "", courseId: "", password: "", confirmPassword: "" };
const TABS = ["Active", "Inactive", "All Students", "Rejected"];

function Dialog({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl ${wide ? "max-w-2xl" : "max-w-lg"}`}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-xl text-muted" aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DirectorySkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[84px] rounded-2xl border border-border-subtle bg-card" />
        ))}
      </div>
      <div className="h-10 w-72 rounded-xl bg-card" />
      <div className="space-y-2 rounded-2xl border border-border-subtle bg-card p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-page" />
        ))}
      </div>
    </div>
  );
}

export default function StudentManagement({ role }) {
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(blank);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importCourseId, setImportCourseId] = useState("");
  const [tab, setTab] = useState("Active");
  const [courseFilter, setCourseFilter] = useState("all");
  const toast = useToast();
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    try {
      const data = await loadStudentDirectory();
      setStudents(data.students);
      setCourses(data.courses);
      setError("");
    } catch (e) {
      setStudents([]);
      setCourses([]);
      setError(e.message || "Unable to load students.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void Promise.resolve().then(load); }, []);

  const close = () => { setCreating(false); setEditing(null); setViewing(null); setForm(blank); };

  async function submit(event) {
    event.preventDefault();
    if (!editing && form.password !== form.confirmPassword) return setError("Passwords do not match.");
    setSaving(true);
    try {
      if (editing) await updateStudent({ uid: editing.id, displayName: form.displayName, phone: form.phone, active: form.active });
      else await createStudent(form);
      close();
      setNotice(editing ? "Student profile updated." : "Student account and enrollment created.");
      await load();
    } catch (e) {
      setError(e.message || "Unable to save student.");
    } finally {
      setSaving(false);
    }
  }

  function deactivate(student) {
    const who = student.displayName || student.email;
    return confirm({
      title: "Deactivate student",
      message: `Deactivate ${who}? They will no longer be able to sign in.`,
      tone: "danger",
      confirmLabel: "Deactivate",
      onConfirm: async () => { await updateStudent({ uid: student.id, active: false }); toast.success("Student deactivated successfully"); await load(); },
    });
  }
  function reactivate(student) {
    const who = student.displayName || student.email;
    return confirm({
      title: "Reactivate student",
      message: `Reactivate ${who}? They will be able to sign in again.`,
      tone: "success",
      confirmLabel: "Reactivate",
      onConfirm: async () => { await updateStudent({ uid: student.id, active: true }); toast.success("Student reactivated successfully"); await load(); },
    });
  }
  function approve(student) {
    const who = student.displayName || student.email;
    return confirm({
      title: "Approve registration",
      message: `Approve ${who}'s registration? They will be able to sign in and use the Student Dashboard.`,
      tone: "success",
      confirmLabel: "Approve",
      onConfirm: async () => { await updateStudent({ uid: student.id, status: "active" }); toast.success("Student approved successfully"); await load(); },
    });
  }
  function reject(student) {
    const who = student.displayName || student.email;
    return confirm({
      title: "Reject registration",
      message: `Reject ${who}'s registration?`,
      tone: "danger",
      confirmLabel: "Reject",
      input: { label: "Reason (optional, shown to the student)", multiline: true, placeholder: "Add an optional note…" },
      onConfirm: async (rejectionReason) => { await updateStudent({ uid: student.id, status: "rejected", rejectionReason }); toast.success("Student rejected successfully"); await load(); },
    });
  }

  const pending = useMemo(() => students.filter((item) => item.status === "pending"), [students]);
  // Rejected registrations never clutter the main tabs (All/Active/Inactive)
  // — they stay in the database and remain reachable, but only via their
  // own dedicated tab.
  const approved = useMemo(() => students.filter((item) => item.status !== "pending" && item.status !== "rejected"), [students]);
  const rejected = useMemo(() => students.filter((item) => item.status === "rejected"), [students]);
  const activeList = useMemo(() => approved.filter((item) => item.active !== false), [approved]);
  const inactiveList = useMemo(() => approved.filter((item) => item.active === false), [approved]);

  const tabRows = { "All Students": approved, Active: activeList, Inactive: inactiveList, Rejected: rejected }[tab];
  const visibleRows = useMemo(() => {
    if (courseFilter === "all") return tabRows;
    return tabRows.filter((item) => (item.courseNames || "").split(",").map((s) => s.trim()).includes(courseFilter));
  }, [tabRows, courseFilter]);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 text-ink shadow-xl">
        <div>
          <h2 className="text-3xl font-black">Students</h2>
          <p className="mt-2 text-sm text-muted">Manage and monitor all student records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { setImportCourseId(""); setImportOpen(true); }} className="rounded-xl border border-border-subtle bg-card px-4 py-3 text-xs font-bold text-ink">Import from Word</button>
          <button onClick={() => { setError(""); setCreating(true); }} className="rounded-xl bg-primary px-4 py-3 text-xs font-bold text-white">+ Add Student</button>
        </div>
      </section>

      {notice && <p className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success">{notice}</p>}
      {error && <div className="rounded-xl bg-active px-4 py-3 text-sm text-primary"><b>Unable to load students.</b><p>{error}</p></div>}

      {loading ? (
        <DirectorySkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Total Students" value={students.length} icon={Users} iconBg="bg-info-soft" iconColor="text-info" />
            <StatCard label="Active" value={activeList.length} icon={UserCheck} iconBg="bg-success-soft" iconColor="text-success" />
            <StatCard label="Inactive" value={inactiveList.length} icon={UserMinus} iconBg="bg-page" iconColor="text-muted" />
            <StatCard label="Rejected" value={rejected.length} icon={UserX} iconBg="bg-active" iconColor="text-primary" />
          </div>

          {pending.length > 0 && (
            <section className="rounded-3xl border border-warning bg-warning-soft p-5 shadow-sm">
              <h3 className="font-bold text-ink">Pending Registrations ({pending.length})</h3>
              <p className="mt-1 text-xs text-muted">New self-registered students waiting for approval before they can sign in.</p>
              <div className="mt-4 space-y-2">
                {pending.map((student) => (
                  <div key={student.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-3">
                    <div>
                      <b className="block text-sm text-ink">{student.displayName || "Unnamed student"}</b>
                      <span className="text-xs text-muted">{student.email} · Registered {student.createdAt ? new Date(student.createdAt).toLocaleDateString() : "--"}</span>
                    </div>
                    <div className="flex gap-2 text-xs font-bold">
                      <button onClick={() => approve(student)} className="rounded-lg bg-success px-3 py-1.5 text-white">Approve</button>
                      <button onClick={() => reject(student)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-primary">Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2 overflow-x-auto">
              {TABS.map((item) => {
                const count = { "All Students": approved.length, Active: activeList.length, Inactive: inactiveList.length, Rejected: rejected.length }[item];
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setTab(item)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition ${tab === item ? "bg-primary text-white" : "bg-page text-muted hover:bg-active hover:text-primary"}`}
                  >
                    {item}
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tab === item ? "bg-white/20" : "bg-card text-subtle"}`}>{count}</span>
                  </button>
                );
              })}
            </div>
            {courses.length > 0 && (
              <label className="flex items-center gap-2 text-xs font-bold text-muted">
                <GraduationCap className="h-4 w-4" aria-hidden="true" />
                <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className="rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs font-bold text-ink shadow-sm">
                  <option value="all">All courses</option>
                  {courses.map((c) => <option key={c.id} value={c.title}>{c.title}</option>)}
                </select>
              </label>
            )}
          </div>

          <StudentTable
            students={visibleRows}
            tab={tab}
            onView={setViewing}
            onEdit={(student) => { setEditing(student); setForm({ displayName: student.displayName || "", phone: student.phone || "", active: student.active !== false }); }}
            onDeactivate={deactivate}
            onReactivate={reactivate}
            onAdd={() => { setError(""); setCreating(true); }}
          />
        </>
      )}

      {creating && (
        <Dialog title="Add student" onClose={close}>
          <StudentForm form={form} setForm={setForm} courses={courses} saving={saving} onSubmit={submit} />
        </Dialog>
      )}
      {editing && (
        <Dialog title="Edit student" onClose={close}>
          <StudentForm form={form} setForm={setForm} courses={courses} editing={editing} saving={saving} onSubmit={submit} />
        </Dialog>
      )}
      {viewing && (
        <Dialog title="Student details" onClose={close} wide>
          <StudentDetails student={viewing} />
        </Dialog>
      )}

      <WordImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import students from Word"
        mode="records"
        hint="Include a table with columns like Student ID, Name, Email, Phone. Each valid row creates a real student account enrolled in the course you choose, with a temporary password."
        columns={[
          { key: "userId", label: "Student ID", aliases: ["id", "student id"] },
          { key: "name", label: "Name", aliases: ["student", "full name"], required: true },
          { key: "email", label: "Email", required: true, validate: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : "Enter a valid email") },
          { key: "phone", label: "Phone", aliases: ["mobile", "contact"], required: true },
        ]}
        dedupe={{ keys: ["email"], existing: students.map((s) => ({ id: s.id, email: s.email, userId: s.userId })), allowUpdate: false }}
        canConfirm={() => (importCourseId ? null : "Choose the course to enrol imported students in.")}
        preamble={
          <label className="grid gap-1 text-xs font-bold text-muted">
            Enrol all imported students in <span className="text-primary">*</span>
            <select value={importCourseId} onChange={(e) => setImportCourseId(e.target.value)} className="rounded-xl border border-border-subtle bg-card px-3 py-2 text-sm font-normal text-ink">
              <option value="">Choose a course…</option>
              {courses.filter((c) => c.enrollmentAvailable !== false).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
        }
        onConfirm={async (rows) => {
          const credentials = [], failed = []; let imported = 0;
          for (let i = 0; i < rows.length; i += 1) {
            const r = rows[i].data, password = genPassword();
            try {
              await createStudent({ displayName: r.name, email: r.email, phone: r.phone, courseId: importCourseId, password });
              credentials.push({ email: r.email, password });
              imported += 1;
            } catch (e) {
              failed.push({ row: i + 1, message: e.message || "Failed to create" });
            }
          }
          await load();
          return { imported, failed, credentials };
        }}
      />
    </div>
  );
}
