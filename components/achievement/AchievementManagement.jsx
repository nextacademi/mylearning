"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Award, BadgeCheck, FileCheck2, LayoutTemplate, ShieldCheck, Trophy } from "lucide-react";
import StatCard from "../finance/StatCard";
import DataTable, { StatusBadge } from "../data-table/DataTable";
import {
  createAward,
  createTemplate,
  deleteTemplate,
  downloadCertificatePdf,
  loadAchievementOverview,
  reissueGeneratedCertificate,
  revokeAward,
  revokeGeneratedCertificate,
  updateAward,
  updateTemplate,
  uploadTemplateBackground,
} from "../../lib/achievement-data";
import { loadStudentDirectoryCached } from "../../lib/services/student-service";
import { AWARD_TYPES, CERTIFICATE_TYPES } from "../../lib/achievement-shared";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import { SkeletonGrid, SkeletonList } from "../ui/Skeleton";
// (ACHIEVEMENT_TYPES also lives in achievement-shared.js — used by
// TeacherWorkspacePage.js's Award-achievement form.)

// One sidebar entry ("Achievement" for Director/Admin), one shell, tabs
// inside — same convention as Finance/Training. Everything certificate-,
// achievement- and award-related lives in this single module; there is no
// separate Certificate or Awards dashboard anywhere else in the app.
const tabs = ["Overview", "Templates", "Generated Certificates", "Achievements", "Awards", "Verification"];

const DYNAMIC_VARIABLES = [
  "{{student_name}}", "{{course_name}}", "{{course_title}}", "{{student_id}}",
  "{{completion_date}}", "{{issue_date}}", "{{certificate_id}}", "{{instructor_name}}",
  "{{trainer_name}}", "{{academy_name}}", "{{duration}}", "{{batch_name}}",
];

export default function AchievementManagement() {
  const [tab, setTab] = useState("Overview");
  const [templates, setTemplates] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [awards, setAwards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(({ force = false } = {}) => {
    setLoading(true);
    loadAchievementOverview({ force })
      .then(([t, c, a]) => {
        setTemplates(t.templates || []);
        setCertificates(c.certificates || []);
        setAwards(a.awards || []);
        setError("");
      })
      .catch((err) => setError(err.message || "Unable to load Achievement data."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const stats = useMemo(() => {
    const activeTemplates = templates.filter((item) => item.status === "active").length;
    const activeCerts = certificates.filter((item) => item.status !== "revoked");
    const now = new Date();
    const thisMonth = activeCerts.filter((item) => {
      const d = item.issueDate?.toDate?.() || (item.issueDate ? new Date(item.issueDate) : null);
      return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const studentsWithCerts = new Set(activeCerts.map((item) => item.studentId)).size;
    return {
      totalTemplates: templates.length,
      activeTemplates,
      generatedCertificates: activeCerts.length,
      certificatesThisMonth: thisMonth.length,
      totalAchievements: certificates.length,
      studentsWithCertificates: studentsWithCerts,
      totalAwards: awards.filter((item) => item.status !== "revoked").length,
    };
  }, [templates, certificates, awards]);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-4 text-ink shadow-sm md:p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Achievement</p>
          <h2 className="mt-2 text-lg font-black">Achievement &amp; Certificates</h2>
          <p className="mt-1 text-xs text-muted">Certificate templates, automatic course-completion certificates, and student achievements — all in one place.</p>
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

      {tab === "Overview" && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Total Templates" value={stats.totalTemplates} icon={LayoutTemplate} iconBg="bg-active" iconColor="text-primary" loading={loading} />
          <StatCard label="Active Templates" value={stats.activeTemplates} icon={BadgeCheck} iconBg="bg-success-soft" iconColor="text-success" loading={loading} />
          <StatCard label="Generated Certificates" value={stats.generatedCertificates} icon={FileCheck2} iconBg="bg-active" iconColor="text-primary" loading={loading} />
          <StatCard label="Certificates This Month" value={stats.certificatesThisMonth} icon={FileCheck2} iconBg="bg-warning-soft" iconColor="text-warning" loading={loading} />
          <StatCard label="Total Achievements" value={stats.totalAchievements} icon={Award} iconBg="bg-active" iconColor="text-primary" loading={loading} />
          <StatCard label="Students With Certificates" value={stats.studentsWithCertificates} icon={ShieldCheck} iconBg="bg-success-soft" iconColor="text-success" loading={loading} />
          <StatCard label="Total Awards" value={stats.totalAwards} icon={Trophy} iconBg="bg-warning-soft" iconColor="text-warning" loading={loading} />
        </section>
      )}

      {tab === "Templates" && <TemplatesTab templates={templates} loading={loading} onChanged={() => load({ force: true })} />}
      {tab === "Generated Certificates" && <CertificatesTab certificates={certificates} loading={loading} onChanged={() => load({ force: true })} />}
      {tab === "Achievements" && <AchievementsTab certificates={certificates} loading={loading} />}
      {tab === "Awards" && <AwardsTab awards={awards} templates={templates} loading={loading} onChanged={() => load({ force: true })} />}
      {tab === "Verification" && <VerificationTab />}
    </div>
  );
}

const blankTemplate = { name: "", description: "", templateCode: "", type: CERTIFICATE_TYPES[0] };

function TemplatesTab({ templates, loading, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankTemplate);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function openNew() {
    setEditing("new");
    setForm(blankTemplate);
    setFile(null);
    setMessage("");
  }
  function openEdit(template) {
    setEditing(template.id);
    setForm({ name: template.name, description: template.description || "", templateCode: template.templateCode, type: template.type });
    setFile(null);
    setMessage("");
  }
  function close() {
    setEditing(null);
    setFile(null);
  }

  async function save() {
    if (!form.name.trim() || !form.templateCode.trim()) return;
    setSaving(true);
    setMessage("");
    try {
      let id = editing !== "new" ? editing : null;
      if (!id) {
        const created = await createTemplate(form);
        id = created.id;
      } else {
        await updateTemplate({ id, ...form });
      }
      if (file) {
        const { backgroundUrl, backgroundPath } = await uploadTemplateBackground(id, file);
        await updateTemplate({ id, backgroundUrl, backgroundPath });
      }
      setMessage(editing === "new" ? "Template created." : "Template updated.");
      close();
      onChanged();
    } catch (error) {
      setMessage(error.message || "Unable to save the template.");
    } finally {
      setSaving(false);
    }
  }
  async function toggleStatus(template) {
    await updateTemplate({ id: template.id, status: template.status === "active" ? "inactive" : "active" });
    onChanged();
  }
  async function duplicate(template) {
    await createTemplate({
      name: `${template.name} (Copy)`,
      description: template.description,
      templateCode: `${template.templateCode}-COPY`,
      type: template.type,
      backgroundUrl: template.backgroundUrl,
      backgroundPath: template.backgroundPath,
      config: template.config,
    });
    onChanged();
  }
  function remove(template) {
    return confirm({
      title: "Delete template",
      message: `Delete template "${template.name}"? This cannot be undone.`,
      tone: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        await deleteTemplate(template.id);
        toast.success("Template deleted successfully");
        onChanged();
      },
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Certificate Templates</h3>
        <button onClick={openNew} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">+ New Template</button>
      </div>

      {message && !editing && <p className="text-xs text-muted">{message}</p>}

      {loading ? (
        <SkeletonGrid count={6} mediaHeight="aspect-video" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" />
      ) : (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => (
          <article key={template.id} className="overflow-hidden rounded-2xl border border-border-subtle bg-card shadow-sm">
            <div className="aspect-video w-full bg-page">
              {template.backgroundUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={template.backgroundUrl} alt={template.name} className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-xs text-subtle">No background uploaded</div>
              )}
            </div>
            <div className="space-y-2 p-4">
              <div className="flex items-center justify-between">
                <b className="text-sm text-ink">{template.name}</b>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${template.status === "active" ? "bg-success-soft text-success" : "bg-page text-subtle"}`}>
                  {template.status === "active" ? "Active" : "Inactive"}
                </span>
              </div>
              <p className="text-[11px] text-muted">{template.type} · <span className="font-mono">{template.templateCode}</span></p>
              {template.description && <p className="text-xs text-muted">{template.description}</p>}
              <div className="flex flex-wrap gap-2 pt-2">
                <button onClick={() => openEdit(template)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-[11px] font-bold text-ink hover:bg-active">Edit</button>
                <button onClick={() => toggleStatus(template)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-[11px] font-bold text-ink hover:bg-active">
                  {template.status === "active" ? "Deactivate" : "Activate"}
                </button>
                <button onClick={() => duplicate(template)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-[11px] font-bold text-ink hover:bg-active">Duplicate</button>
                <button onClick={() => remove(template)} className="rounded-lg border border-border-subtle px-3 py-1.5 text-[11px] font-bold text-primary hover:bg-active">Delete</button>
              </div>
            </div>
          </article>
        ))}
        {!templates.length && <p className="text-sm text-muted">No certificate templates yet — create one to enable certificates on a course.</p>}
      </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-card p-6 shadow-xl">
            <h4 className="text-sm font-bold text-ink">{editing === "new" ? "New Certificate Template" : "Edit Certificate Template"}</h4>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Next Academy Course Completion" className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Description
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs font-bold text-muted">
                Template Code
                <input value={form.templateCode} onChange={(e) => setForm({ ...form, templateCode: e.target.value })} placeholder="NACADEMY-COURSE" className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
              </label>
              <label className="grid gap-1 text-xs font-bold text-muted">
                Certificate Type
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal">
                  {CERTIFICATE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-xs font-bold text-muted">
              Background Image
              <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-xs" />
            </label>
            <div className="rounded-xl border border-dashed border-border-subtle p-3">
              <p className="mb-1 text-[10px] font-bold uppercase text-subtle">Dynamic variables available on the final certificate</p>
              <p className="font-mono text-[11px] text-muted">{DYNAMIC_VARIABLES.join("  ")}</p>
            </div>
            {message && <p className="text-xs text-primary">{message}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={close} disabled={saving} className="px-4 py-2 text-sm font-bold text-muted">Cancel</button>
              <button onClick={save} disabled={saving || !form.name.trim() || !form.templateCode.trim()} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {saving ? "Saving..." : "Save Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const certIssueDate = (cert) => cert.issueDate?.toDate?.().toLocaleDateString?.() || cert.metadata?.completionDate || "";

function CertificatesTab({ certificates, loading, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState("");
  const [viewingId, setViewingId] = useState("");

  // Plain <a href="/api/certificates/.../pdf"> browser navigation sends no
  // Authorization header, so the route (auth-gated, since it's not a
  // public verify link) 401s and the browser just shows "Sign in to
  // continue." — same fetch+blob+window.open pattern already used by
  // StudentAchievements.jsx's own certificate download.
  async function view(cert) {
    setViewingId(cert.id);
    try {
      const blob = await downloadCertificatePdf(cert.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      toast.error(error.message || "Unable to open this certificate.");
    } finally {
      setViewingId("");
    }
  }

  const columns = [
    { key: "studentName", header: "Student", sortable: true, accessor: (c) => `${c.studentName || ""} ${c.studentUserId || ""}`, render: (c) => <span><b className="block text-ink">{c.studentName || "—"}</b><span className="text-[11px] text-subtle">{c.studentUserId}</span></span>, exportValue: (c) => c.studentName || "" },
    { key: "courseName", header: "Course", sortable: true, filter: {}, accessor: (c) => c.courseName || "" },
    { key: "type", header: "Type", sortable: true, filter: {}, accessor: (c) => c.type || "" },
    { key: "templateName", header: "Template", accessor: (c) => c.templateName || "" },
    { key: "certificateCode", header: "Certificate ID", accessor: (c) => c.certificateCode || c.id, render: (c) => <span className="font-mono text-[11px]">{c.certificateCode || c.id}</span> },
    { key: "issueDate", header: "Issue Date", sortable: true, accessor: (c) => certIssueDate(c), render: (c) => <span className="text-xs">{certIssueDate(c) || "—"}</span> },
    { key: "status", header: "Status", sortable: true, filter: {}, accessor: (c) => (c.status === "revoked" ? "Revoked" : "Active"), render: (c) => <StatusBadge tone={c.status === "revoked" ? "red" : "green"}>{c.status === "revoked" ? "Revoked" : "Active"}</StatusBadge> },
  ];

  function revoke(cert) {
    return confirm({
      title: "Revoke certificate",
      message: `Revoke certificate ${cert.certificateCode || cert.id}? It will no longer verify as valid.`,
      tone: "danger",
      confirmLabel: "Revoke",
      onConfirm: async () => {
        setBusyId(cert.id);
        try {
          await revokeGeneratedCertificate(cert.id);
          toast.success("Certificate revoked successfully");
          onChanged();
        } finally {
          setBusyId("");
        }
      },
    });
  }
  async function reissue(cert) {
    setBusyId(cert.id);
    try {
      await reissueGeneratedCertificate(cert.id);
      toast.success("Certificate reissued successfully");
      onChanged();
    } catch (error) {
      toast.error(error.message || "Unable to reissue this certificate.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section className="space-y-4">
      {loading ? (
        <SkeletonList count={6} />
      ) : (
      <DataTable
        title="certificates"
        name="certificates"
        columns={columns}
        rows={certificates}
        initialSort={{ key: "issueDate", dir: "desc" }}
        pageSize={10}
        emptyLabel="No certificates issued yet."
        rowActions={(cert) => (
          <>
            <button type="button" disabled={viewingId === cert.id} onClick={() => view(cert)} className="rounded-lg bg-info px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90 disabled:opacity-50">{viewingId === cert.id ? "Opening…" : "View"}</button>
            <a href={`/verify/${encodeURIComponent(cert.certificateCode || cert.id)}`} target="_blank" rel="noreferrer" className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-page">Verify</a>
            {cert.status !== "revoked" ? (
              <button type="button" disabled={busyId === cert.id} onClick={() => revoke(cert)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-page disabled:opacity-50">Revoke</button>
            ) : (
              <button type="button" disabled={busyId === cert.id} onClick={() => reissue(cert)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-page disabled:opacity-50">Reissue</button>
            )}
          </>
        )}
      />
      )}
    </section>
  );
}

function AchievementsTab({ certificates, loading }) {
  // Achievements are the underlying "award" every issued certificate is
  // linked to (see certificate-core.js) — this view gives the admin the
  // same list from the achievement angle without a second data source.
  const columns = [
    { key: "studentName", header: "Student", sortable: true, accessor: (c) => c.studentName || c.studentId || "", render: (c) => <b className="text-ink">{c.studentName || c.studentId}</b> },
    { key: "title", header: "Achievement", sortable: true, accessor: (c) => c.title || c.type || "" },
    { key: "type", header: "Type", sortable: true, filter: {}, accessor: (c) => c.type || "" },
    { key: "courseName", header: "Course", sortable: true, filter: {}, accessor: (c) => c.courseName || "" },
    { key: "issueDate", header: "Issued", sortable: true, accessor: (c) => certIssueDate(c), render: (c) => <span className="text-xs">{certIssueDate(c) || "—"}</span> },
    { key: "status", header: "Status", sortable: true, filter: {}, accessor: (c) => (c.status === "revoked" ? "Revoked" : "Active"), render: (c) => <StatusBadge tone={c.status === "revoked" ? "red" : "green"}>{c.status === "revoked" ? "Revoked" : "Active"}</StatusBadge> },
  ];
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-bold text-ink">Certificates issued (linked achievements)</h3>
      {loading ? (
        <SkeletonList count={6} />
      ) : (
        <DataTable title="achievements" name="achievements" columns={columns} rows={certificates} initialSort={{ key: "issueDate", dir: "desc" }} pageSize={10} emptyLabel="No achievements recorded yet." />
      )}
    </section>
  );
}

const blankAward = { studentId: "", title: "", type: AWARD_TYPES[0], description: "", courseId: "", icon: "🏆", awardDate: new Date().toISOString().slice(0, 10), generateCertificate: false, templateId: "" };
const awardDate = (award) => award.awardDate || award.awardedAt?.toDate?.().toLocaleDateString?.() || "";
const studentLabel = (s) => `${s.displayName || s.email || "Unnamed student"}${s.role === "Guest" ? " (Guest)" : ""}`;

// A single searchable combobox (one input, one dropdown) replacing what
// used to be a separate search box stacked on top of a raw multi-row
// <select> — that pairing read as visually duplicated in a narrow modal.
// Typing here only filters the dropdown; it never clears `selected` (the
// actual stored studentId) — only clicking an option does, per spec.
function StudentCombobox({ students, loading, selected, onSelect }) {
  const [query, setQuery] = useState(selected ? studentLabel(selected) : "");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = !q ? students : students.filter((s) => (s.displayName || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q));
    return pool.slice(0, 50);
  }, [students, query]);

  function pick(student) {
    setQuery(studentLabel(student));
    onSelect(student);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={loading ? "Loading students…" : "Search by student name or email…"}
        disabled={loading}
        className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal disabled:opacity-60"
      />
      {selected && <p className="mt-1 text-[11px] font-normal text-success">Selected: {studentLabel(selected)}</p>}
      {open && !loading && (
        <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border-subtle bg-card p-1 shadow-xl">
          {filtered.length ? (
            filtered.map((s) => (
              <button
                type="button"
                key={s.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(s)}
                className={`block w-full rounded-lg px-3 py-2 text-left text-xs font-normal hover:bg-active ${selected?.id === s.id ? "bg-active font-bold text-ink" : "text-ink"}`}
              >
                <span className="block">{s.displayName || "Unnamed student"}{s.role === "Guest" ? " (Guest)" : ""}</span>
                {s.email && <span className="block text-[11px] text-subtle">{s.email}</span>}
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-xs text-subtle">No students found.</p>
          )}
        </div>
      )}
    </div>
  );
}

// Awards are a distinct concept from Achievements above (a manually-issued
// honor an Admin/Director grants, per the spec) even though both are
// stored in the same `achievements` collection server-side — see
// award-core.js's header for why that's safe. This tab is the only place
// in the app that writes `kind: "award"` records.
function AwardsTab({ awards, templates, loading, onChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankAward);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const [viewingId, setViewingId] = useState("");
  const [students, setStudents] = useState([]);
  const [courses, setCourses] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(true);

  useEffect(() => {
    loadStudentDirectoryCached()
      .then(({ students: s, courses: c }) => {
        setStudents(s || []);
        setCourses(c || []);
      })
      .catch(() => {})
      .finally(() => setStudentsLoading(false));
  }, []);

  const activeTemplates = useMemo(() => templates.filter((item) => item.status === "active"), [templates]);
  const selectedStudent = useMemo(() => students.find((s) => s.id === form.studentId) || null, [students, form.studentId]);

  const columns = [
    { key: "awardId", header: "Award ID", accessor: (a) => a.awardId || a.id, render: (a) => <span className="font-mono text-[11px]">{a.awardId || a.id}</span> },
    { key: "studentName", header: "Student", sortable: true, accessor: (a) => a.studentName || a.studentId || "", render: (a) => <span><b className="block text-ink">{a.studentName || "—"}</b><span className="text-[11px] text-subtle">{a.studentUserId}</span></span> },
    { key: "title", header: "Award", sortable: true, accessor: (a) => a.title || "", render: (a) => <span>{a.icon || "🏆"} {a.title}</span> },
    { key: "type", header: "Type", sortable: true, filter: {}, accessor: (a) => a.type || "" },
    { key: "courseName", header: "Training / Course", sortable: true, filter: {}, accessor: (a) => a.courseName || "" },
    { key: "awardDate", header: "Award Date", sortable: true, accessor: (a) => awardDate(a) },
    { key: "certificateId", header: "Certificate", accessor: (a) => (a.certificateId ? "Generated" : "—"), render: (a) => (a.certificateId ? <StatusBadge tone="green">Generated</StatusBadge> : <span className="text-xs text-subtle">—</span>) },
    { key: "status", header: "Status", sortable: true, filter: {}, accessor: (a) => (a.status === "revoked" ? "Revoked" : "Active"), render: (a) => <StatusBadge tone={a.status === "revoked" ? "red" : "green"}>{a.status === "revoked" ? "Revoked" : "Active"}</StatusBadge> },
  ];

  function openNew() {
    setEditing("new");
    setForm(blankAward);
    setMessage("");
  }
  function openEdit(award) {
    setEditing(award.id);
    setForm({
      studentId: award.studentId,
      title: award.title || "",
      type: award.type || AWARD_TYPES[0],
      description: award.description || "",
      courseId: award.courseId || "",
      icon: award.icon || "🏆",
      awardDate: award.awardDate || new Date().toISOString().slice(0, 10),
      generateCertificate: false,
      templateId: "",
    });
    setMessage("");
  }
  function close() {
    setEditing(null);
  }

  async function save() {
    if (!form.title.trim() || (editing === "new" && !form.studentId)) return;
    setSaving(true);
    setMessage("");
    try {
      if (editing === "new") {
        await createAward(form);
        toast.success("Award issued successfully");
      } else {
        await updateAward({ id: editing, ...form });
        toast.success("Award updated successfully");
      }
      close();
      onChanged();
    } catch (error) {
      setMessage(error.message || "Unable to save the award.");
    } finally {
      setSaving(false);
    }
  }

  async function viewCertificate(award) {
    setViewingId(award.id);
    try {
      const blob = await downloadCertificatePdf(award.certificateId);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      toast.error(error.message || "Unable to open this certificate.");
    } finally {
      setViewingId("");
    }
  }

  function revoke(award) {
    return confirm({
      title: "Revoke award",
      message: `Revoke the award "${award.title}" for ${award.studentName || "this student"}? It will remain on record as revoked.`,
      tone: "danger",
      confirmLabel: "Revoke",
      onConfirm: async () => {
        setBusyId(award.id);
        try {
          await revokeAward(award.id);
          toast.success("Award revoked successfully");
          onChanged();
        } finally {
          setBusyId("");
        }
      },
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Awards</h3>
        <button onClick={openNew} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">+ Give Award</button>
      </div>

      {loading ? (
        <SkeletonList count={6} />
      ) : (
        <DataTable
          title="awards"
          name="awards"
          columns={columns}
          rows={awards}
          initialSort={{ key: "awardDate", dir: "desc" }}
          pageSize={10}
          emptyLabel="No awards given yet."
          rowActions={(award) => (
            <>
              <button type="button" onClick={() => openEdit(award)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-page">Edit</button>
              {award.certificateId && (
                <button type="button" disabled={viewingId === award.id} onClick={() => viewCertificate(award)} className="rounded-lg bg-info px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90 disabled:opacity-50">{viewingId === award.id ? "Opening…" : "Certificate"}</button>
              )}
              {award.status !== "revoked" && (
                <button type="button" disabled={busyId === award.id} onClick={() => revoke(award)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-page disabled:opacity-50">Revoke</button>
              )}
            </>
          )}
        />
      )}

      {editing && (
        // items-start (not place-items-center) + py-8 on the overlay: a
        // vertically-centered flex/grid container can't be scrolled to
        // reach content that overflows above the fold once this form grew
        // past a couple of fields — flowing top-down fixes that while
        // still reading as centered on anything tall enough to fit it.
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 py-8">
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-card p-6 shadow-xl">
            <h4 className="text-sm font-bold text-ink">{editing === "new" ? "Give a New Award" : "Edit Award"}</h4>

            {editing === "new" ? (
              <div className="grid gap-1 text-xs font-bold text-muted">
                Student
                <StudentCombobox
                  students={students}
                  loading={studentsLoading}
                  selected={selectedStudent}
                  onSelect={(student) => setForm({ ...form, studentId: student.id })}
                />
              </div>
            ) : (
              <p className="text-xs text-muted">Student: <b className="text-ink">{awards.find((a) => a.id === editing)?.studentName || form.studentId}</b> (not editable — revoke and re-issue to change the student)</p>
            )}

            <label className="grid gap-1 text-xs font-bold text-muted">
              Award Title
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Best Student of the Batch" className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs font-bold text-muted">
                Award Type
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal">
                  {AWARD_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold text-muted">
                Award Date
                <input type="date" value={form.awardDate} onChange={(e) => setForm({ ...form, awardDate: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs font-bold text-muted">
                Training / Course (optional)
                <select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal">
                  <option value="">None</option>
                  {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-bold text-muted">
                Badge / Icon
                <input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="🏆" maxLength={4} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
              </label>
            </div>

            <label className="grid gap-1 text-xs font-bold text-muted">
              Description
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal" />
            </label>

            {editing === "new" && (
              <div className="space-y-2 rounded-xl border border-dashed border-border-subtle p-3">
                <label className="flex items-center gap-2 text-xs font-bold text-muted">
                  <input type="checkbox" className="h-4 w-4 shrink-0 accent-primary" checked={form.generateCertificate} onChange={(e) => setForm({ ...form, generateCertificate: e.target.checked, templateId: e.target.checked ? form.templateId : "" })} />
                  Generate Certificate for this award
                </label>
                {form.generateCertificate && (
                  <select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })} className="w-full rounded-xl border border-border-subtle px-3 py-2 text-sm font-normal">
                    <option value="">Choose a certificate template…</option>
                    {activeTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
              </div>
            )}

            {message && <p className="text-xs text-primary">{message}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={close} disabled={saving} className="px-4 py-2 text-sm font-bold text-muted">Cancel</button>
              <button
                onClick={save}
                disabled={saving || !form.title.trim() || (editing === "new" && (!form.studentId || (form.generateCertificate && !form.templateId)))}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : editing === "new" ? "Give Award" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function VerificationTab() {
  const [id, setId] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function verify() {
    if (!id.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch(`/api/verify/${encodeURIComponent(id.trim())}`);
      setResult(await response.json());
    } catch {
      setResult({ result: "not_found" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="max-w-lg space-y-4 rounded-2xl border border-border-subtle bg-card p-6 shadow-sm">
      <h3 className="text-sm font-bold text-ink">Verify a Certificate</h3>
      <div className="flex gap-2">
        <input value={id} onChange={(e) => setId(e.target.value)} placeholder="Enter Certificate ID" className="flex-1 rounded-xl border border-border-subtle px-3 py-2 text-sm" />
        <button onClick={verify} disabled={loading} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Verify</button>
      </div>
      {result && (
        <div className={`rounded-xl border p-4 text-sm ${result.result === "valid" ? "border-success bg-success-soft" : "border-primary bg-active"}`}>
          {result.result === "valid" && (
            <>
              <b className="block text-success">✓ Valid Certificate</b>
              <p className="mt-2 text-xs text-ink">Student: {result.studentName}</p>
              <p className="text-xs text-ink">Course: {result.courseName}</p>
              <p className="text-xs text-ink">Issue Date: {result.issueDate}</p>
              <p className="text-xs text-ink">Certificate ID: {result.certificateId}</p>
            </>
          )}
          {result.result === "revoked" && <b className="block text-primary">⚠ This certificate has been revoked and is no longer valid.</b>}
          {result.result === "not_found" && <b className="block text-primary">✕ No certificate found with this ID.</b>}
        </div>
      )}
    </section>
  );
}
