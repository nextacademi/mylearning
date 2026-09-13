"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Eye, LayoutGrid, Pencil, Search, Table2, User, Users } from "lucide-react";
import TrainingForm from "./TrainingForm";
import DataTable, { StatusBadge } from "../data-table/DataTable";
import WordImportModal from "../word-import/WordImportModal";
import { createCourse, loadTraining, updateCourse } from "../../lib/services/training-service";
import { uploadCourseThumbnail } from "../../lib/teacher-training";

const COURSE_STATUS_TONE = { Active: "green", Upcoming: "blue", Draft: "orange", Completed: "gray", Archived: "gray", Cancelled: "red" };

function TrainingTable({ courses, canManage, onEdit }) {
  const columns = [
    { key: "courseCode", header: "Course Code", sortable: true, accessor: (c) => c.courseCode || "", render: (c) => <b className="font-mono text-xs text-ink">{c.courseCode || "—"}</b> },
    { key: "title", header: "Course", sortable: true, accessor: (c) => c.title || "", render: (c) => <b className="text-ink">{c.title || "Untitled"}</b> },
    { key: "category", header: "Category", sortable: true, filter: {}, accessor: (c) => c.category || "" },
    { key: "duration", header: "Duration", accessor: (c) => c.duration || "" },
    { key: "classCount", header: "Classes", align: "right", sortable: true, accessor: (c) => c.classCount ?? 0 },
    { key: "enrolled", header: "Students", align: "right", sortable: true, accessor: (c) => c.enrolled ?? 0, render: (c) => <b className="text-ink">{c.enrolled ?? 0}</b> },
    { key: "teachers", header: "Teachers", accessor: (c) => (c.teachers || []).map((t) => t.displayName || t.email).join(", "), render: (c) => (c.teachers?.length ? (c.teachers.map((t) => t.displayName || t.email).join(", ")) : <span className="text-subtle">Not assigned</span>) },
    { key: "status", header: "Status", sortable: true, filter: {}, accessor: (c) => c.status || "", render: (c) => <StatusBadge tone={COURSE_STATUS_TONE[c.status] || "gray"}>{c.status || "—"}</StatusBadge> },
  ];
  return (
    <DataTable
      title="training"
      name="courses"
      columns={columns}
      rows={courses}
      initialSort={{ key: "title", dir: "asc" }}
      pageSize={10}
      emptyLabel="No trainings found."
      rowActions={(course) => (
        <>
          <Link href={`/dashboard/training/${course.id}`} className="rounded-lg bg-info px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90">Open</Link>
          {canManage && <button type="button" onClick={() => onEdit(course)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-page">Edit</button>}
        </>
      )}
    />
  );
}

const blank = {
  title: "",
  description: "",
  status: "Draft",
  category: "",
  level: "",
  thumbnailUrl: "",
  thumbnailPath: "",
  price: "",
  discountPrice: "",
  currency: "SGD",
  startDate: "",
  endDate: "",
  startTime: "",
  endTime: "",
  duration: "",
  classFrequency: "",
  totalClasses: "",
  primaryTeacherId: "",
  assistantTeacherId: "",
  campus: "",
  building: "",
  room: "",
  floor: "",
  batchName: "",
  maxStudents: "",
  seatCapacity: "",
  enrollmentStartDate: "",
  enrollmentDeadline: "",
  enrollmentStatus: "Open",
  passingScore: "",
  certificateEnabled: false,
  certificateMinAttendance: "",
  certificateMinScore: "",
  certificateTemplateId: "",
  certificateCode: "",
};
const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString() : "—";
const currencySymbols = { SGD: "S$" };
const formatMoney = (value, currency) => `${currencySymbols[currency] || ""}${Number(value).toLocaleString()}`;

// Shared by both the Teacher and Admin/Director training cards so the
// price line stays identical everywhere it's shown.
function PriceLine({ course }) {
  const price = Number(course.price) || 0;
  const discount =
    course.discountPrice !== null && course.discountPrice !== undefined && course.discountPrice !== ""
      ? Number(course.discountPrice)
      : null;
  if (price === 0) {
    return <span className="text-sm font-bold text-success">Free</span>;
  }
  if (discount !== null && discount >= 0 && discount < price) {
    const percentOff = Math.round(((price - discount) / price) * 100);
    return (
      <span className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-bold text-ink">{formatMoney(discount, course.currency)}</span>
        <span className="text-xs text-subtle line-through">{formatMoney(price, course.currency)}</span>
        <span className="text-[10px] font-bold text-success">{percentOff}% OFF</span>
      </span>
    );
  }
  return <span className="text-sm font-bold text-ink">{formatMoney(price, course.currency)}</span>;
}

function Dialog({ title, children, close }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true"><div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl"><div className="mb-5 flex justify-between"><h2 className="text-lg font-bold">{title}</h2><button type="button" onClick={close} className="text-xl text-muted" aria-label="Close">×</button></div>{children}</div></div>;
}
function TeacherTrainingCard({ course }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-3xl border border-border-subtle bg-card shadow-sm">
      {course.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={course.thumbnailUrl} alt={course.title} className="h-36 w-full object-cover" />
      ) : (
        <div className="grid h-36 w-full place-items-center bg-active text-3xl font-black text-primary">
          {(course.title || "T")[0].toUpperCase()}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] font-bold text-subtle">{course.courseCode || course.id}</span>
          <Badge value={course.status} />
        </div>
        <h3 className="font-bold text-ink">{course.title || "Untitled training"}</h3>
        <p className="text-xs text-muted">{[course.category, course.level].filter(Boolean).join(" · ") || "No category/level set"}</p>
        <p className="text-xs text-muted">
          {course.teachers?.length ? course.teachers.map((item) => item.displayName || item.email).join(", ") : "Not assigned"}
        </p>
        <p className="text-xs text-muted">
          {[course.campus, course.building, course.room].filter(Boolean).join(", ") || "Classroom not set"}
        </p>
        <div className="mt-1 flex gap-4 text-xs text-muted">
          <span><b>{course.enrolled}</b> enrolled</span>
          <span><b>{course.classCount}</b> class(es)</span>
        </div>
        <PriceLine course={course} />
        <Link
          href={`/dashboard/training/${course.id}`}
          className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white"
        >
          <Eye className="h-3.5 w-3.5" /> View Training
        </Link>
      </div>
    </article>
  );
}
const statusTones = {
  Active: "bg-success-soft text-success",
  Upcoming: "bg-info-soft text-info",
  Completed: "bg-teal-soft text-teal",
  Draft: "bg-page text-muted",
  Archived: "bg-page text-subtle",
};
function Badge({ value }) {
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusTones[value] || "bg-page text-muted"}`}>{value || "—"}</span>;
}
// Mirrors the thumbnailUrl-only check TeacherTrainingCard already uses —
// thumbnailUrl is the resolved download URL saved at upload time
// (uploadCourseThumbnail), so thumbnailPath alone never needs a separate
// resolution step here.
function TrainingThumbnail({ course }) {
  if (course.thumbnailUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={course.thumbnailUrl}
        alt={course.title || "Training thumbnail"}
        className="h-[180px] w-full rounded-t-3xl object-cover"
      />
    );
  }
  return (
    <div className="grid h-[180px] w-full place-items-center rounded-t-3xl border-b border-border-subtle bg-page text-sm font-semibold text-subtle">
      No Image
    </div>
  );
}
function AdminTrainingCard({ course, canManage, onEdit }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-3xl border border-border-subtle bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <TrainingThumbnail course={course} />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-subtle">{course.courseCode || course.id}</span>
          <Badge value={course.status} />
        </div>
        <h3 className="text-lg font-bold text-ink">{course.title || "Untitled training"}</h3>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <User className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />
          {course.teachers?.length ? course.teachers.map((item) => item.displayName || item.email || item.id).join(", ") : "Not assigned"}
        </p>
        <div className="text-xs text-muted">
          <p>{formatDate(course.startDate)} – {formatDate(course.endDate)}</p>
          {course.duration && <p className="mt-0.5">{course.duration}</p>}
        </div>
        <div className="mt-1 flex items-center gap-4 text-xs font-semibold text-ink">
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />
            {course.enrolled} Enrolled
          </span>
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-subtle" aria-hidden="true" />
            {course.classCount} {course.classCount === 1 ? "Class" : "Classes"}
          </span>
        </div>
        <PriceLine course={course} />
        <div className="mt-auto flex gap-2 pt-3">
          <Link
            href={`/dashboard/training/${course.id}`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-white transition hover:bg-primary-hover"
          >
            <Eye className="h-3.5 w-3.5" /> View Training
          </Link>
          {canManage && (
            <button
              type="button"
              onClick={() => onEdit(course)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-border-subtle px-3 py-2.5 text-xs font-bold text-ink transition hover:bg-active hover:text-primary"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function TrainingManagement({ role }) {
  const [data, setData] = useState({ courses: [], teachers: [], canManage: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [teacher, setTeacher] = useState("All");
  const [form, setForm] = useState(blank);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [thumbnailPreview, setThumbnailPreview] = useState("");
  const [viewMode, setViewMode] = useState("table");
  const [wordOpen, setWordOpen] = useState(false);
  const isTeacher = role === "Teacher";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await loadTraining();
      setData(result);
      setError("");
    } catch (loadError) {
      console.error("[training] assigned course load failed", loadError);
      setData({ courses: [], teachers: [], canManage: false });
      setError(isTeacher ? "Failed to load your assigned courses." : (loadError.message || "Unable to load training data. Please try again."));
    } finally {
      setLoading(false);
    }
  }, [isTeacher]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  const courses = useMemo(() => data.courses.filter((course) =>
    (status === "All" || course.status === status) &&
    (teacher === "All" || course.teacherIds.includes(teacher)) &&
    `${course.courseCode || ""} ${course.id} ${course.title} ${course.teachers.map((item) => `${item.displayName} ${item.email}`).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()),
  ), [data.courses, search, status, teacher]);
  const counts = useMemo(() => ({
    total: data.courses.length,
    active: data.courses.filter((item) => item.status === "Active").length,
    upcoming: data.courses.filter((item) => item.status === "Upcoming").length,
    enrolled: data.courses.reduce((sum, item) => sum + Number(item.enrolled || 0), 0),
  }), [data.courses]);
  const statuses = ["All", ...new Set(data.courses.map((course) => course.status).filter(Boolean))];

  function selectThumbnail(file) {
    setThumbnailFile(file);
    setThumbnailPreview(file ? URL.createObjectURL(file) : "");
  }

  // "Remove" only clears the reference so the next Save writes no
  // thumbnail — it does not delete the existing Storage object, since no
  // deletion flow exists elsewhere in the app for thumbnails either.
  function removeThumbnail() {
    selectThumbnail(null);
    setForm((current) => ({ ...current, thumbnailUrl: "", thumbnailPath: "" }));
  }

  function open(course) {
    setEditing(course || null);
    setAdding(!course);
    setForm(
      course
        ? {
            title: course.title,
            description: course.description,
            status: course.status || "Draft",
            category: course.category || "",
            level: course.level || "",
            thumbnailUrl: course.thumbnailUrl || "",
            thumbnailPath: course.thumbnailPath || "",
            price: course.price ?? "",
            discountPrice: course.discountPrice ?? "",
            currency: "SGD",
            startDate: course.startDate || "",
            endDate: course.endDate || "",
            startTime: course.startTime || "",
            endTime: course.endTime || "",
            duration: course.duration || "",
            classFrequency: course.classFrequency || "",
            totalClasses: course.totalClasses ?? "",
            primaryTeacherId: course.primaryTeacherId || "",
            assistantTeacherId: course.assistantTeacherId || "",
            campus: course.campus || "",
            building: course.building || "",
            room: course.room || "",
            floor: course.floor || "",
            batchName: course.batchName || "",
            maxStudents: course.maxStudents ?? "",
            seatCapacity: course.seatCapacity ?? "",
            enrollmentStartDate: course.enrollmentStartDate || "",
            enrollmentDeadline: course.enrollmentDeadline || "",
            enrollmentStatus: course.enrollmentStatus || "Open",
            passingScore: course.passingScore ?? "",
            certificateEnabled: Boolean(course.certificateEnabled),
            certificateMinAttendance: course.certificateMinAttendance ?? "",
            certificateMinScore: course.certificateMinScore ?? "",
            certificateTemplateId: course.certificateTemplateId || "",
            certificateCode: course.certificateCode || "",
          }
        : { ...blank },
    );
    selectThumbnail(null);
    setError("");
  }
  function closeForm() {
    setEditing(null);
    setAdding(false);
    setForm(blank);
    selectThumbnail(null);
  }
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      let created = null;
      let thumbnailUrl = form.thumbnailUrl;
      let thumbnailPath = form.thumbnailPath;

      if (editing) {
        // The course already has an ID, so upload the new thumbnail (if
        // any) BEFORE writing anything. If the upload fails, updateCourse
        // never runs — the rest of the form is never partially saved with
        // a stale thumbnail, and no "saved" notice is shown.
        if (thumbnailFile) {
          ({ thumbnailUrl, thumbnailPath } = await uploadCourseThumbnail(editing.id, thumbnailFile));
        }
        await updateCourse({ id: editing.id, ...form, thumbnailUrl, thumbnailPath });
      } else {
        // A brand-new training has no ID yet, and the thumbnail's Storage
        // path is keyed by courseId — so the course must be created first,
        // then the thumbnail is uploaded and attached in one more write.
        const result = await createCourse({ ...form, thumbnailUrl: "", thumbnailPath: "" });
        created = result.course;
        if (thumbnailFile) {
          ({ thumbnailUrl, thumbnailPath } = await uploadCourseThumbnail(created.id, thumbnailFile));
          await updateCourse({ id: created.id, ...form, thumbnailUrl, thumbnailPath });
        }
      }

      const teacherNames = [form.primaryTeacherId, form.assistantTeacherId]
        .filter(Boolean)
        .map((id) => data.teachers.find((item) => item.id === id)?.displayName || data.teachers.find((item) => item.id === id)?.email || id)
        .join(", ") || "Not assigned";
      setNotice(created ? `Training Created Successfully — ${created.title} (Training ID: ${created.courseCode || created.id}; Teacher: ${teacherNames})` : "Training updated successfully.");
      closeForm();
      await load();
    } catch (saveError) {
      setError(saveError.message || "Unable to save training.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="space-y-6">
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 text-ink shadow-xl"><div><h2 className="text-3xl font-black">Training</h2><p className="mt-2 text-sm text-muted">{isTeacher ? "Your assigned offline classroom trainings." : "Manage offline classroom trainings, teachers, batches, and enrolled students."}</p></div>{data.canManage && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setWordOpen(true)} className="rounded-xl border border-border-subtle bg-card px-4 py-3 text-xs font-bold text-ink">Import from Word</button><button type="button" onClick={() => open(null)} className="rounded-xl bg-primary px-4 py-3 text-xs font-bold text-white">Add Training</button></div>}</section>
    {notice && <p className="rounded-xl bg-success-soft p-4 text-sm text-success">{notice}</p>}
    {error && !editing && !adding && <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Total Training", counts.total], ["Active", counts.active], ["Upcoming", counts.upcoming], ["Total Enrolled", counts.enrolled]].map(([label, value]) => <article key={label} className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</p><p className="mt-2 text-2xl font-extrabold">{loading ? "—" : value}</p></article>)}</section>
    {!isTeacher && (
      <div className="flex justify-end">
        <div className="inline-flex overflow-hidden rounded-xl border border-border-subtle">
          <button type="button" onClick={() => setViewMode("table")} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold ${viewMode === "table" ? "bg-success text-white" : "bg-card text-muted"}`}><Table2 className="h-3.5 w-3.5" /> Table</button>
          <button type="button" onClick={() => setViewMode("cards")} className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold ${viewMode === "cards" ? "bg-success text-white" : "bg-card text-muted"}`}><LayoutGrid className="h-3.5 w-3.5" /> Cards</button>
        </div>
      </div>
    )}

    {!isTeacher && viewMode === "table" ? (
      <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
        {loading ? <p className="py-10 text-center text-sm text-muted">Loading training...</p> : <TrainingTable courses={data.courses} canManage={data.canManage} onEdit={open} />}
      </section>
    ) : (
      <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6"><div className="mb-5 flex flex-wrap gap-3"><label className="relative min-w-56 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-subtle"/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search training, ID, or teacher" className="w-full rounded-xl border border-border-subtle bg-page py-2 pl-9 pr-3 text-sm"/></label><select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 text-sm">{statuses.map((item) => <option key={item}>{item}</option>)}</select>{data.canManage && <select value={teacher} onChange={(event) => setTeacher(event.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 text-sm"><option value="All">All teachers</option>{data.teachers.map((item) => <option value={item.id} key={item.id}>{item.displayName || item.email || item.id}</option>)}</select>}</div>
        {loading ? (
          <p className="py-10 text-center text-sm text-muted">{isTeacher ? "Loading assigned trainings..." : "Loading training..."}</p>
        ) : courses.length ? (
          isTeacher ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {courses.map((course) => <TeacherTrainingCard key={course.id} course={course} />)}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {courses.map((course) => (
                <AdminTrainingCard key={course.id} course={course} canManage={data.canManage} onEdit={open} />
              ))}
            </div>
          )
        ) : (
          <p className="py-10 text-center text-sm text-muted">{search || status !== "All" || teacher !== "All" ? "No trainings match your search." : isTeacher ? "No trainings have been assigned to you yet." : "No trainings found."}</p>
        )}
      </section>
    )}
    {editing !== null && <Dialog title="Edit Training" close={() => !saving && closeForm()}><TrainingForm course={{ form, setForm, editing }} teachers={data.teachers} saving={saving} onCancel={closeForm} onSubmit={submit} thumbnailPreview={thumbnailPreview || form.thumbnailUrl} onThumbnailSelect={selectThumbnail} onThumbnailRemove={removeThumbnail}/>{error && <p className="mt-3 text-sm text-primary">{error}</p>}</Dialog>}
    {editing === null && adding && <Dialog title="Add Training" close={closeForm}><TrainingForm course={{ form, setForm, editing: null }} teachers={data.teachers} saving={saving} onCancel={closeForm} onSubmit={submit} thumbnailPreview={thumbnailPreview} onThumbnailSelect={selectThumbnail} onThumbnailRemove={removeThumbnail}/>{error && <p className="mt-3 text-sm text-primary">{error}</p>}</Dialog>}
    <WordImportModal
      open={wordOpen}
      onClose={() => setWordOpen(false)}
      title="Import course from Word"
      mode="fields"
      hint="Use labels like “Course Name:”, “Duration:”, “Category:”, “Description:”, “Syllabus:”. The values fill the Add Training form for you to review — nothing is saved until you choose a teacher and click Save."
      fields={[
        { key: "title", label: "Course Name", aliases: ["course", "training name", "name", "title"] },
        { key: "courseCode", label: "Course Code", aliases: ["code", "training code"] },
        { key: "duration", label: "Duration", aliases: ["length"] },
        { key: "category", label: "Category", aliases: ["type"] },
        { key: "level", label: "Level" },
        { key: "description", label: "Description", aliases: ["about", "overview"], multiline: true },
        { key: "syllabus", label: "Syllabus", aliases: ["outline", "modules", "curriculum"], multiline: true },
      ]}
      onConfirm={async (values) => {
        setWordOpen(false);
        setEditing(null);
        setAdding(true);
        setForm({
          ...blank,
          title: values.title || "",
          category: values.category || "",
          duration: values.duration || "",
          level: ["Beginner", "Intermediate", "Advanced"].includes(values.level) ? values.level : "",
          description: [values.description || "", values.syllabus ? `\n\nSyllabus:\n${values.syllabus}` : ""].filter(Boolean).join(""),
        });
        selectThumbnail(null);
        setError("");
      }}
    />
  </div>;
}
