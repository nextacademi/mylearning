"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen, GraduationCap, Layers, Mail, Phone, Search, UserPlus, Users, X,
} from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import DataTable from "../data-table/DataTable";
import { SkeletonList } from "../ui/Skeleton";
import {
  assignTeacher, loadTeacherAssignmentDataCached, removeTeacher, saveTeacherAssignment,
} from "../../lib/services/teacher-assignment-service";

// ---------------------------------------------------------------------------
// Small shared pieces
// ---------------------------------------------------------------------------
const initials = (t) => (t?.displayName || t?.email || "?").trim().slice(0, 2).toUpperCase();

function Avatar({ teacher, size = "h-10 w-10", text = "text-xs" }) {
  if (teacher?.photoURL) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={teacher.photoURL} alt={teacher.displayName || "Teacher"} className={`${size} shrink-0 rounded-full object-cover`} />;
  }
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-full bg-success-soft ${text} font-black text-success`}>
      {initials(teacher)}
    </span>
  );
}

// Workload tier from the teacher's real assigned load.
function tierOf(teacher) {
  const load = (teacher.courseCount || 0) + (teacher.classCount || 0);
  if (load <= 2) return { key: "low", label: "Low", cls: "bg-success-soft text-success" };
  if (load <= 5) return { key: "medium", label: "Medium", cls: "bg-warning-soft text-warning" };
  return { key: "high", label: "High", cls: "bg-active text-primary" };
}

function WorkloadBadge({ teacher }) {
  const tier = tierOf(teacher);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${tier.cls}`}>{tier.label}</span>
      <span className="text-[11px] font-semibold text-muted">
        {teacher.courseCount || 0}C · {teacher.classCount || 0}B · {teacher.studentCount || 0}S
      </span>
    </span>
  );
}

function StatusBadge({ active }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${active ? "bg-success-soft text-success" : "bg-page text-muted"}`}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function CourseChip({ children, tone = "success" }) {
  const tones = {
    success: "bg-success-soft text-success",
    info: "bg-info-soft text-info",
    purple: "bg-purple-soft text-purple",
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tones[tone] || tones.success}`}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Searchable teacher picker (name / email / Teacher ID) with a preview
// ---------------------------------------------------------------------------
function TeacherPicker({ teachers, exclude = [], onPick, busy, compact }) {
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState(null);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return teachers
      .filter((t) => !exclude.includes(t.id))
      .filter((t) => !term || `${t.displayName} ${t.email} ${t.userId || ""}`.toLowerCase().includes(term))
      .slice(0, 8);
  }, [teachers, exclude, query]);

  const assignable = teachers.filter((t) => !exclude.includes(t.id)).length;

  return (
    <div className="space-y-3">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-subtle" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setPreview(null); }}
          placeholder="Search teacher by name, email or ID…"
          className="w-full rounded-xl border border-border-subtle bg-card py-2.5 pl-9 pr-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-success"
        />
      </label>

      {!assignable ? (
        <p className="rounded-xl bg-page px-3 py-2 text-xs text-muted">Every active teacher is already assigned here.</p>
      ) : (
        <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-border-subtle bg-card p-1">
          {matches.length ? matches.map((teacher) => (
            <button
              key={teacher.id}
              type="button"
              onClick={() => setPreview(teacher)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-success-soft ${preview?.id === teacher.id ? "bg-success-soft" : ""}`}
            >
              <Avatar teacher={teacher} size="h-8 w-8" text="text-[10px]" />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-xs text-ink">{teacher.displayName || "Unnamed teacher"}</b>
                <small className="block truncate text-[11px] text-muted">{teacher.email}{teacher.userId ? ` · ${teacher.userId}` : ""}</small>
              </span>
              <WorkloadBadge teacher={teacher} />
            </button>
          )) : <p className="px-2 py-3 text-center text-xs text-muted">No teacher matches “{query}”.</p>}
        </div>
      )}

      {preview && (
        <div className={`rounded-xl border border-success/40 bg-success-soft/40 p-3 ${compact ? "" : "sm:flex sm:items-center sm:justify-between"}`}>
          <div className="flex items-center gap-3">
            <Avatar teacher={preview} />
            <div className="min-w-0">
              <b className="block truncate text-sm text-ink">{preview.displayName || "Unnamed teacher"}</b>
              <span className="block truncate text-xs text-muted">{preview.email}</span>
              <span className="mt-0.5 block text-[11px] text-muted">
                {preview.userId ? `ID ${preview.userId}` : "No Teacher ID"}
                {preview.phone ? ` · ${preview.phone}` : ""}
              </span>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => onPick(preview)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-success px-4 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-60 sm:mt-0"
          >
            <UserPlus className="h-3.5 w-3.5" /> Assign this teacher
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// View one teacher's profile + current assignments
// ---------------------------------------------------------------------------
function TeacherView({ teacher, courses, classes, onClose }) {
  const myCourses = courses.filter((course) => (course.teacherIds || []).includes(teacher.id));
  const myClasses = classes.filter((cls) => (cls.teacherIds || []).includes(teacher.id));
  const tier = tierOf(teacher);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Avatar teacher={teacher} size="h-14 w-14" text="text-base" />
            <div className="min-w-0">
              <b className="block truncate text-lg text-ink">{teacher.displayName || "Unnamed teacher"}</b>
              <span className="block truncate text-sm text-muted">{teacher.designation || teacher.department || "Teacher"}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-page" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <dl className="grid gap-2 rounded-2xl border border-border-subtle p-3 text-sm">
          <div className="flex items-center gap-2 text-muted"><Mail className="h-4 w-4 text-subtle" /> {teacher.email || "—"}</div>
          <div className="flex items-center gap-2 text-muted"><Phone className="h-4 w-4 text-subtle" /> {teacher.phone || "—"}</div>
          <div className="flex items-center gap-2 text-muted"><GraduationCap className="h-4 w-4 text-subtle" /> Teacher ID: {teacher.userId || "—"}</div>
          <div className="flex items-center gap-2"><StatusBadge active={teacher.active} /></div>
        </dl>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[["Courses", teacher.courseCount || 0], ["Classes", teacher.classCount || 0], ["Students", teacher.studentCount || 0]].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-border-subtle bg-page p-3">
              <p className="text-2xl font-black text-ink">{value}</p>
              <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-xs text-muted">
          Current load: <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${tier.cls}`}>{tier.label}</span>
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-subtle">Assigned courses</p>
            {myCourses.length ? (
              <div className="flex flex-wrap gap-1.5">{myCourses.map((course) => <CourseChip key={course.id}>{course.title}</CourseChip>)}</div>
            ) : <p className="text-xs text-muted">None yet.</p>}
          </div>
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-subtle">Assigned classes / batches</p>
            {myClasses.length ? (
              <div className="flex flex-wrap gap-1.5">{myClasses.map((cls) => <CourseChip key={cls.id} tone="info">{cls.name}</CourseChip>)}</div>
            ) : <p className="text-xs text-muted">None yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Directory tab
// ---------------------------------------------------------------------------
function DirectoryTab({ data, loading, onView, onNavigate }) {
  const columns = useMemo(() => [
    {
      key: "displayName", header: "Teacher", sortable: true, accessor: (t) => t.displayName || "",
      render: (t) => (
        <div className="flex items-center gap-2.5">
          <Avatar teacher={t} />
          <div className="min-w-0">
            <b className="block truncate text-sm text-ink">{t.displayName || "Unnamed teacher"}</b>
            <span className="block truncate text-[11px] text-muted">{t.userId ? `ID ${t.userId}` : "No Teacher ID"}{t.phone ? ` · ${t.phone}` : ""}</span>
          </div>
        </div>
      ),
      exportValue: (t) => t.displayName || "",
    },
    { key: "email", header: "Email", sortable: true, accessor: (t) => t.email || "" },
    { key: "courseCount", header: "Courses", align: "right", sortable: true, accessor: (t) => t.courseCount || 0, render: (t) => <b className="text-ink">{t.courseCount || 0}</b> },
    { key: "classCount", header: "Classes", align: "right", sortable: true, accessor: (t) => t.classCount || 0, render: (t) => <b className="text-ink">{t.classCount || 0}</b> },
    { key: "studentCount", header: "Students", align: "right", sortable: true, accessor: (t) => t.studentCount || 0 },
    {
      key: "load", header: "Current Load", sortable: true, filter: {},
      accessor: (t) => tierOf(t).label,
      render: (t) => <WorkloadBadge teacher={t} />,
    },
    {
      key: "status", header: "Status", sortable: true, filter: {},
      accessor: (t) => (t.active ? "Active" : "Inactive"),
      render: (t) => <StatusBadge active={t.active} />,
    },
  ], []);

  if (loading) return <SkeletonList count={6} />;

  if (!data.teachers.length) {
    return (
      <div className="rounded-3xl border border-dashed border-border-subtle bg-card py-16 text-center">
        <Users className="mx-auto h-9 w-9 text-subtle" aria-hidden="true" />
        <p className="mt-3 text-lg font-black text-ink">No active teacher accounts exist yet</p>
        <p className="mt-1 text-sm text-muted">Create a Teacher account first, then assign them to courses or classes.</p>
        {onNavigate && (
          <button type="button" onClick={() => onNavigate("User")} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-success px-4 py-2.5 text-xs font-bold text-white hover:opacity-90">
            <UserPlus className="h-4 w-4" /> Create Teacher Account
          </button>
        )}
      </div>
    );
  }

  // The "Teacher ID" is folded into the Teacher cell for display, but kept as
  // its own hidden/export column so it lands in exports.
  const exportColumns = [
    { key: "userId", exportHeader: "Teacher ID", accessor: (t) => t.userId || "" },
    { key: "displayName", exportHeader: "Teacher", accessor: (t) => t.displayName || "" },
    { key: "email", exportHeader: "Email", accessor: (t) => t.email || "" },
    { key: "phone", exportHeader: "Phone", accessor: (t) => t.phone || "" },
    { key: "courseCount", exportHeader: "Courses", accessor: (t) => t.courseCount || 0 },
    { key: "classCount", exportHeader: "Classes", accessor: (t) => t.classCount || 0 },
    { key: "studentCount", exportHeader: "Students", accessor: (t) => t.studentCount || 0 },
    { key: "load", exportHeader: "Load", accessor: (t) => tierOf(t).label },
    { key: "status", exportHeader: "Status", accessor: (t) => (t.active ? "Active" : "Inactive") },
  ];

  return (
    <DataTable
      title="teachers"
      name="teachers"
      columns={columns}
      exportColumns={exportColumns}
      rows={data.teachers}
      initialSort={{ key: "displayName", dir: "asc" }}
      pageSize={10}
      emptyLabel="No active teacher accounts exist yet."
      rowActions={(teacher) => (
        <button type="button" onClick={() => onView(teacher)} className="rounded-lg bg-info px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-90">View</button>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Courses tab
// ---------------------------------------------------------------------------
function CoursesTab({ data, busy, onAssign, onRemove }) {
  const [courseId, setCourseId] = useState("");
  const course = data.courses.find((item) => item.id === courseId);
  const teacherById = useMemo(() => new Map(data.teachers.map((t) => [t.id, t])), [data.teachers]);
  const assigned = (course?.teacherIds || []).map((id) => teacherById.get(id)).filter(Boolean);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <label className="grid gap-1 text-xs font-bold text-muted">
          Select course / training
          <select value={courseId} onChange={(event) => setCourseId(event.target.value)} className="rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-success">
            <option value="">Choose a course…</option>
            {data.courses.map((item) => <option key={item.id} value={item.id}>{item.title}{item.courseCode ? ` (${item.courseCode})` : ""}</option>)}
          </select>
        </label>
        {!data.courses.length && <p className="rounded-xl bg-page px-3 py-2 text-xs text-muted">No courses exist yet. Create one under Training first.</p>}

        {course && (
          <div className="rounded-2xl border border-border-subtle bg-card p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Course details</p>
            <b className="mt-1 block text-base text-ink">{course.title}</b>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div><dt className="text-subtle">Course code</dt><dd className="font-bold text-ink">{course.courseCode || "—"}</dd></div>
              <div><dt className="text-subtle">Duration</dt><dd className="font-bold text-ink">{course.duration || "—"}</dd></div>
              <div><dt className="text-subtle">Classes / batches</dt><dd className="font-bold text-ink">{course.classCount}</dd></div>
              <div><dt className="text-subtle">Enrolled students</dt><dd className="font-bold text-ink">{course.enrolledCount}</dd></div>
              <div><dt className="text-subtle">Status</dt><dd className="font-bold text-ink">{course.status || "—"}</dd></div>
              <div><dt className="text-subtle">Assigned teachers</dt><dd className="font-bold text-ink">{assigned.length}</dd></div>
            </dl>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {!course ? (
          <p className="rounded-2xl border border-dashed border-border-subtle bg-card py-12 text-center text-sm text-muted">Choose a course to view and manage its teachers.</p>
        ) : (
          <>
            <div className="rounded-2xl border border-border-subtle bg-card p-4 shadow-sm">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">Current teachers</p>
              {assigned.length ? (
                <ul className="space-y-2">
                  {assigned.map((teacher) => (
                    <li key={teacher.id} className="flex items-center gap-2.5 rounded-xl border border-border-subtle p-2.5">
                      <Avatar teacher={teacher} size="h-9 w-9" text="text-[10px]" />
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-xs text-ink">
                          {teacher.displayName || "Unnamed teacher"}
                          {course.primaryTeacherId === teacher.id && <span className="ml-1.5 rounded-full bg-success-soft px-1.5 py-0.5 text-[9px] font-black uppercase text-success">Primary</span>}
                        </b>
                        <small className="block truncate text-[11px] text-muted">{teacher.email}</small>
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onRemove({ type: "course", target: course, teacher })}
                        className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-active disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl bg-page px-3 py-3 text-center text-xs font-bold text-muted">No teacher assigned</p>
              )}
            </div>

            <div className="rounded-2xl border border-border-subtle bg-card p-4 shadow-sm">
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">Assign a teacher</p>
              <TeacherPicker
                teachers={data.teachers}
                exclude={course.teacherIds || []}
                busy={busy}
                onPick={(teacher) => onAssign({ type: "course", target: course, teacher })}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Classes tab
// ---------------------------------------------------------------------------
function ClassesTab({ data, busy, onAssignClass, onChangeClass, onRemove }) {
  const teacherById = useMemo(() => new Map(data.teachers.map((t) => [t.id, t])), [data.teachers]);

  if (!data.classes.length) {
    return <p className="rounded-2xl border border-dashed border-border-subtle bg-card py-12 text-center text-sm text-muted">No class / batch records exist yet. They are created with each course under Training.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-card shadow-sm">
      <table className="w-full text-left text-sm" style={{ minWidth: "920px" }}>
        <thead className="bg-page text-[10px] font-black uppercase tracking-wider text-muted">
          <tr>
            {["Class / Batch", "Course", "Schedule", "Room", "Students", "Teacher", "Action"].map((head) => (
              <th key={head} className={`px-4 py-3 ${head === "Students" ? "text-right" : ""}`}>{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.classes.map((cls) => {
            const assigned = (cls.teacherIds || []).map((id) => teacherById.get(id)).filter(Boolean);
            return (
              <tr key={cls.id} className="border-t border-border-subtle align-top transition-colors hover:bg-page">
                <td className="px-4 py-3"><b className="text-sm text-ink">{cls.name}</b></td>
                <td className="px-4 py-3">{cls.courseName ? <CourseChip>{cls.courseName}</CourseChip> : <span className="text-xs text-subtle">—</span>}</td>
                <td className="px-4 py-3 text-xs text-muted">{cls.schedule || "—"}</td>
                <td className="px-4 py-3 text-xs text-muted">{cls.room || "—"}</td>
                <td className="px-4 py-3 text-right text-sm font-black text-ink">{cls.studentCount}</td>
                <td className="px-4 py-3">
                  {assigned.length ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {assigned.map((teacher) => (
                        <span key={teacher.id} className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2 py-1 text-[11px] font-bold text-success">
                          <Avatar teacher={teacher} size="h-5 w-5" text="text-[8px]" /> {teacher.displayName || teacher.email}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="rounded-full bg-page px-2.5 py-1 text-[11px] font-bold text-muted">Not assigned</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {assigned.length ? (
                      <>
                        <button type="button" disabled={busy} onClick={() => onChangeClass(cls)} className="rounded-lg bg-info px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90 disabled:opacity-60">Change</button>
                        <button type="button" disabled={busy} onClick={() => onRemove({ type: "class", target: cls, teacher: assigned[0], all: true })} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-active disabled:opacity-60">Remove</button>
                      </>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => onAssignClass(cls)} className="rounded-lg bg-success px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90 disabled:opacity-60">Assign Teacher</button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Modal wrapper for the class-level teacher picker
function ClassAssignModal({ cls, data, busy, onClose, onPick }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-2xl">
        <div className="mb-1 flex items-center justify-between gap-4">
          <h3 className="text-lg font-bold text-ink">Assign teacher</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-page" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-xs text-muted">{cls.name}{cls.courseName ? ` · ${cls.courseName}` : ""}</p>
        <TeacherPicker teachers={data.teachers} exclude={cls.teacherIds || []} busy={busy} compact onPick={onPick} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------
export default function TeacherAssignment({ onNavigate }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState({ teachers: [], courses: [], classes: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("directory");
  const [viewing, setViewing] = useState(null);
  const [classModal, setClassModal] = useState(null); // { cls, mode: "assign" | "change" }
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  const reload = useCallback(
    ({ force = false } = {}) =>
      loadTeacherAssignmentDataCached({ force })
        .then((result) => { if (mounted.current) { setData(result); setError(""); } })
        .catch((loadError) => { if (mounted.current) setError(loadError.message || "Unable to load teacher assignments."); })
        .finally(() => { if (mounted.current) setLoading(false); }),
    [],
  );

  useEffect(() => {
    mounted.current = true;
    reload();
    return () => { mounted.current = false; };
  }, [reload]);

  const run = useCallback(async (fn, okMessage) => {
    setBusy(true);
    try {
      await fn();
      if (okMessage) toast.success(okMessage);
      await reload({ force: true });
      return true;
    } catch (actionError) {
      toast.error(actionError.message || "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }, [reload, toast]);

  const assign = useCallback(({ type, target, teacher }) =>
    run(
      () => assignTeacher({ type, id: target.id, teacherId: teacher.id }),
      `${teacher.displayName || "Teacher"} assigned to ${target.title || target.name}.`,
    ), [run]);

  const remove = useCallback(async ({ type, target, teacher, all }) => {
    const ok = await confirm({
      title: "Remove teacher",
      message: `Remove ${teacher.displayName || teacher.email} from “${target.title || target.name}”? Their access to this ${type === "course" ? "course" : "class"} is revoked immediately.`,
      tone: "danger",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    await run(
      () => (all ? saveTeacherAssignment({ type, id: target.id, teacherIds: [] }) : removeTeacher({ type, id: target.id, teacherId: teacher.id })),
      "Teacher removed.",
    );
  }, [confirm, run]);

  const pickForClass = useCallback(async (teacher) => {
    const modal = classModal;
    if (!modal) return;
    const cls = modal.cls;
    const currentIds = cls.teacherIds || [];
    if (modal.mode === "change" && currentIds.length) {
      const currentNames = currentIds
        .map((id) => data.teachers.find((t) => t.id === id)?.displayName || "current teacher")
        .join(", ");
      const ok = await confirm({
        title: "Replace teacher",
        message: `Replace ${currentNames} with ${teacher.displayName || teacher.email} for “${cls.name}”? The previous assignment is overwritten.`,
        tone: "danger",
        confirmLabel: "Replace",
      });
      if (!ok) return;
    }
    const done = await run(
      () => saveTeacherAssignment({ type: "class", id: cls.id, teacherIds: [teacher.id] }),
      `${teacher.displayName || "Teacher"} assigned to ${cls.name}.`,
    );
    if (done) setClassModal(null);
  }, [classModal, confirm, data.teachers, run]);

  const tabs = [
    ["directory", "Teacher Directory", Users],
    ["courses", "Courses", BookOpen],
    ["classes", "Classes", Layers],
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[#bfe6cf] bg-[linear-gradient(120deg,#eafaf1_0%,#f4fbf7_45%,#ffffff_100%)] p-6 text-ink shadow-xl md:p-8">
        <h2 className="flex items-center gap-2 text-2xl font-black md:text-3xl"><GraduationCap className="h-7 w-7 text-success" aria-hidden="true" /> Teacher Assignment</h2>
        <p className="mt-2 text-sm text-muted">Assign real, active Teacher accounts to your existing courses and classes. Workload updates automatically from live enrollment data.</p>
        {!loading && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-card px-3 py-1.5 text-ink shadow-sm">{data.teachers.length} active teacher{data.teachers.length === 1 ? "" : "s"}</span>
            <span className="rounded-full bg-card px-3 py-1.5 text-ink shadow-sm">{data.courses.length} course{data.courses.length === 1 ? "" : "s"}</span>
            <span className="rounded-full bg-card px-3 py-1.5 text-ink shadow-sm">{data.classes.length} class{data.classes.length === 1 ? "" : "es"}</span>
          </div>
        )}
      </section>

      {error && <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {tabs.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors ${tab === key ? "bg-success text-white shadow-sm" : "bg-page text-muted hover:text-ink"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === "directory" && <DirectoryTab data={data} loading={loading} onView={setViewing} onNavigate={onNavigate} />}
      {tab === "courses" && (loading
        ? <SkeletonList count={4} />
        : <CoursesTab data={data} busy={busy} onAssign={assign} onRemove={remove} />)}
      {tab === "classes" && (loading
        ? <SkeletonList count={4} />
        : <ClassesTab
            data={data}
            busy={busy}
            onAssignClass={(cls) => setClassModal({ cls, mode: "assign" })}
            onChangeClass={(cls) => setClassModal({ cls, mode: "change" })}
            onRemove={remove}
          />)}

      {viewing && <TeacherView teacher={viewing} courses={data.courses} classes={data.classes} onClose={() => setViewing(null)} />}
      {classModal && (
        <ClassAssignModal
          cls={classModal.cls}
          data={data}
          busy={busy}
          onClose={() => setClassModal(null)}
          onPick={pickForClass}
        />
      )}
    </div>
  );
}
