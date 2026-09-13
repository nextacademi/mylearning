"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download, Eye, FileText, FolderPlus, Layers, Loader2, Pencil, Search, Trash2, Upload, X,
} from "lucide-react";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import ExportMenu from "../data-table/ExportMenu";

const DOC_EXPORT_COLUMNS = [
  { key: "name", exportHeader: "Document", accessor: (d) => d.name || "" },
  { key: "courseName", exportHeader: "Course", accessor: (d) => d.courseName || "" },
  { key: "category", exportHeader: "Category", accessor: (d) => d.category || "" },
  { key: "fileKind", exportHeader: "File Type", accessor: (d) => fileKind(d.fileType, d.fileName) },
  { key: "fileSize", exportHeader: "Size", accessor: (d) => formatFileSize(d.fileSize) },
  { key: "audienceType", exportHeader: "Audience", accessor: (d) => AUDIENCE_LABELS[d.audienceType] || d.audienceType || "" },
  { key: "status", exportHeader: "Status", accessor: (d) => d.status || "" },
  { key: "folderName", exportHeader: "Folder", accessor: (d) => d.folderName || "" },
  { key: "uploadedByName", exportHeader: "Uploaded By", accessor: (d) => d.uploadedByName || "" },
  { key: "createdAt", exportHeader: "Uploaded", accessor: (d) => formatDocDate(d.createdAt) },
];
import {
  AUDIENCE_LABELS, createDocument, createFolder, deleteDocument, deleteFolder,
  fetchDocumentBlobUrl, fileKind, formatDocDate, formatFileSize, loadDocuments,
  renameFolder, updateDocument,
} from "../../lib/documents-data";

const MANAGER_AUDIENCES = ["all_students", "course", "class", "student", "teachers", "facilitators", "staff"];
const TEACHER_AUDIENCES = ["course", "class"];
const STATUS_TONES = {
  published: "bg-success-soft text-success",
  draft: "bg-warning-soft text-warning",
  archived: "bg-page text-muted",
};
const KIND_TONES = {
  PDF: "bg-active text-primary",
  DOC: "bg-info-soft text-info",
  PPT: "bg-warning-soft text-warning",
  XLS: "bg-success-soft text-success",
  IMG: "bg-purple-soft text-purple",
  ZIP: "bg-page text-muted",
  TXT: "bg-page text-muted",
  FILE: "bg-page text-muted",
};

function Modal({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-card p-5 shadow-2xl sm:p-6 ${wide ? "max-w-2xl" : "max-w-md"}`}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-page" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FileBadge({ kind }) {
  return <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[10px] font-black ${KIND_TONES[kind] || KIND_TONES.FILE}`}>{kind}</span>;
}
function StatusBadge({ status }) {
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${STATUS_TONES[status] || STATUS_TONES.draft}`}>{status}</span>;
}

// `viewOnly` — Students may open a document to read it but get NO download
// action (per the access rule: "student sudo view korte parbe, no download").
function DocActions({ doc, viewOnly }) {
  if (!doc.fileUrl) return null;
  return (
    <div className="flex items-center gap-2">
      <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-active">
        <Eye className="h-3.5 w-3.5" /> View
      </a>
      {!viewOnly && (
        <a href={doc.fileUrl} download={doc.fileName || doc.name} className="inline-flex items-center gap-1 rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-ink hover:bg-active">
          <Download className="h-3.5 w-3.5" /> Download
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upload / edit form
// ---------------------------------------------------------------------------
const BLANK = { name: "", description: "", category: "", folderId: "", courseId: "", classId: "", audienceType: "", status: "published", audienceIds: [] };

function DocumentForm({ initial, editing, data, canManagerControls, lockedCourseId, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ ...BLANK, ...initial, ...(lockedCourseId ? { courseId: lockedCourseId } : {}) }));
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const audiences = canManagerControls ? MANAGER_AUDIENCES : TEACHER_AUDIENCES;
  const courseClasses = useMemo(
    () => (data.classes || []).filter((batch) => !form.courseId || batch.courseId === form.courseId),
    [data.classes, form.courseId],
  );
  const studentMatches = useMemo(() => {
    const term = studentQuery.trim().toLowerCase();
    if (!term) return [];
    return (data.students || []).filter((s) => `${s.name} ${s.email}`.toLowerCase().includes(term)).slice(0, 8);
  }, [data.students, studentQuery]);
  const chosenStudents = (data.students || []).filter((s) => form.audienceIds.includes(s.id));

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    if (!form.name.trim()) return setError("Enter a document name.");
    if (!form.audienceType) return setError("Choose an audience.");
    if (!editing && !file) return setError("Choose a file to upload.");
    if ((form.audienceType === "course" || form.audienceType === "class") && !form.courseId) return setError("Choose a course / training.");
    if (form.audienceType === "class" && !form.classId) return setError("Choose a class / batch.");
    if (form.audienceType === "student" && !form.audienceIds.length) return setError("Choose at least one student.");
    setError("");
    setSaving(true);
    try {
      const meta = {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category.trim(),
        folderId: form.folderId,
        // The selected course is always saved as `courseId` on the document
        // (the existing relation field) whenever one is chosen — not only
        // for a course/class audience.
        courseId: form.courseId,
        classId: form.audienceType === "class" ? form.classId : "",
        audienceType: form.audienceType,
        audienceIds: form.audienceType === "student" ? form.audienceIds : [],
        status: form.status,
      };
      if (editing) await updateDocument(editing.id, meta, file || undefined);
      else await createDocument(meta, file);
      onSaved(editing ? "Document updated" : "Document uploaded");
    } catch (submitError) {
      setError(submitError.message || "Unable to save this document.");
    } finally {
      setSaving(false);
    }
  }

  const label = "grid gap-1 text-xs font-bold text-muted";
  const field = "rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary";

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className={label}>Document name <span className="text-primary">*</span>
        <input value={form.name} onChange={set("name")} required maxLength={200} className={field} />
      </label>
      <label className={label}>Description
        <textarea value={form.description} onChange={set("description")} rows={2} maxLength={2000} className={field} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>Category
          <input value={form.category} onChange={set("category")} maxLength={120} placeholder="e.g. Lecture notes" className={field} />
        </label>
        <label className={label}>Folder
          <select value={form.folderId} onChange={set("folderId")} className={field}>
            <option value="">No folder</option>
            {(data.folders || []).map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
        </label>
      </div>

      <label className={label}>
        File {editing ? <span className="font-normal text-subtle">(leave empty to keep the current file)</span> : <span className="text-primary">*</span>}
        <input
          type="file"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.zip,image/*"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          className="rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs"
        />
        {editing && !file && editing.fileName && <span className="text-[11px] text-subtle">Current: {editing.fileName}</span>}
        {file && <span className="text-[11px] text-subtle">{file.name} · {formatFileSize(file.size)}</span>}
      </label>

      <label className={label}>Audience <span className="text-primary">*</span>
        <select value={form.audienceType} onChange={set("audienceType")} required className={field}>
          <option value="">Choose an audience</option>
          {audiences.map((value) => <option key={value} value={value}>{AUDIENCE_LABELS[value]}</option>)}
        </select>
      </label>

      {/* Course / Training — always shown, options loaded from the live
          course list. Required only when the audience is a course or class;
          otherwise optional (still saved as the document's courseId). */}
      <label className={label}>
        Course / Training {(form.audienceType === "course" || form.audienceType === "class") ? <span className="text-primary">*</span> : <span className="font-normal text-subtle">(optional)</span>}
        <select
          value={form.courseId}
          onChange={(event) => setForm((c) => ({ ...c, courseId: event.target.value, classId: "" }))}
          required={form.audienceType === "course" || form.audienceType === "class"}
          disabled={Boolean(lockedCourseId)}
          className={`${field} disabled:bg-page disabled:text-muted`}
        >
          <option value="">{form.audienceType === "course" || form.audienceType === "class" ? "Select a course" : "No course / general"}</option>
          {(data.courses || []).map((course) => (
            <option key={course.id} value={course.id}>{course.title}{course.courseCode ? ` (${course.courseCode})` : ""}</option>
          ))}
        </select>
      </label>

      {form.audienceType === "class" && (
        <label className={label}>Class / Batch <span className="text-primary">*</span>
          <select value={form.classId} onChange={set("classId")} required disabled={!form.courseId} className={`${field} disabled:bg-page`}>
            <option value="">{form.courseId ? "Select a class" : "Choose a course first"}</option>
            {courseClasses.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
          </select>
        </label>
      )}

      {form.audienceType === "student" && canManagerControls && (
        <div className={label}>
          Students <span className="text-primary">*</span>
          <input value={studentQuery} onChange={(event) => setStudentQuery(event.target.value)} placeholder="Search students by name or email" className={field} />
          {studentMatches.length > 0 && (
            <div className="mt-1 rounded-xl border border-border-subtle bg-card p-1 shadow-sm">
              {studentMatches.map((student) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => { setForm((c) => ({ ...c, audienceIds: [...new Set([...c.audienceIds, student.id])] })); setStudentQuery(""); }}
                  className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-page"
                >
                  <b className="text-ink">{student.name}</b> <span className="text-subtle">{student.email}</span>
                </button>
              ))}
            </div>
          )}
          {chosenStudents.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chosenStudents.map((student) => (
                <span key={student.id} className="inline-flex items-center gap-1 rounded-full bg-active px-2.5 py-1 text-[11px] font-bold text-primary">
                  {student.name}
                  <button type="button" onClick={() => setForm((c) => ({ ...c, audienceIds: c.audienceIds.filter((id) => id !== student.id) }))} aria-label="Remove"><X className="h-3 w-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <label className={label}>Status
        <select value={form.status} onChange={set("status")} className={field}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          {canManagerControls && <option value="archived">Archived</option>}
        </select>
      </label>

      {error && <p className="rounded-xl bg-active px-3 py-2 text-sm text-primary">{error}</p>}
      <div className="flex justify-end gap-3 pt-1">
        <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted">Cancel</button>
        <button disabled={saving} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
          {saving ? "Saving…" : editing ? "Save changes" : "Upload Document"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------
function DetailRow({ label, children }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border-subtle py-2.5 last:border-0">
      <dt className="text-xs font-bold uppercase tracking-wider text-subtle">{label}</dt>
      <dd className="text-right text-sm font-semibold text-ink">{children || "—"}</dd>
    </div>
  );
}
function DocumentDetail({ doc, onClose, viewOnly }) {
  return (
    <Modal title="Document details" onClose={onClose}>
      <div className="mb-3 flex items-center gap-3">
        <FileBadge kind={fileKind(doc.fileType, doc.fileName)} />
        <div className="min-w-0">
          <b className="block truncate text-sm text-ink">{doc.name}</b>
          <span className="text-xs text-muted">{fileKind(doc.fileType, doc.fileName)} · {formatFileSize(doc.fileSize)}</span>
        </div>
      </div>
      <dl className="rounded-2xl border border-border-subtle p-3">
        <DetailRow label="Description">{doc.description}</DetailRow>
        <DetailRow label="Category">{doc.category}</DetailRow>
        <DetailRow label="Folder">{doc.folderName}</DetailRow>
        <DetailRow label="Course">{doc.courseName}</DetailRow>
        <DetailRow label="Audience">{AUDIENCE_LABELS[doc.audienceType] || "—"}</DetailRow>
        <DetailRow label="Status"><StatusBadge status={doc.status} /></DetailRow>
        <DetailRow label="File name">{doc.fileName}</DetailRow>
        <DetailRow label="Uploaded by">{doc.uploadedByName}</DetailRow>
        <DetailRow label="Created">{formatDocDate(doc.createdAt)}</DetailRow>
        <DetailRow label="Updated">{formatDocDate(doc.updatedAt)}</DetailRow>
        {doc.publishedAt && <DetailRow label="Published">{formatDocDate(doc.publishedAt)}</DetailRow>}
      </dl>
      <div className="mt-4"><DocActions doc={doc} viewOnly={viewOnly} /></div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// In-LMS document viewer — students open documents here, never at the raw
// Storage URL. The file is streamed through the authorised endpoint into a
// short-lived in-browser blob URL; no download control is shown and the
// blob URL is revoked as soon as the viewer closes.
// ---------------------------------------------------------------------------
function DocViewerModal({ doc, onClose }) {
  const [state, setState] = useState({ status: "loading", url: "", type: "" });

  useEffect(() => {
    let objectUrl = "";
    let active = true;
    fetchDocumentBlobUrl(doc.id)
      .then(({ url, type }) => {
        objectUrl = url;
        if (active) setState({ status: "ready", url, type });
        else URL.revokeObjectURL(url);
      })
      .catch((err) => {
        if (active) setState({ status: "error", url: "", type: "", message: err.message });
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.id]);

  const kind = fileKind(doc.fileType, doc.fileName);
  const isPdf = kind === "PDF" || (state.type || "").includes("pdf");
  const isImage = kind === "IMG" || (state.type || "").startsWith("image/");
  const isText = kind === "TXT" || (state.type || "").startsWith("text/");
  const previewable = isPdf || isImage || isText;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-3 sm:p-6" role="dialog" aria-modal="true">
      <div className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between gap-4 border-b border-border-subtle bg-page px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <FileBadge kind={kind} />
            <div className="min-w-0">
              <b className="block truncate text-sm text-ink">{doc.name}</b>
              <span className="text-[11px] text-muted">{kind} · {formatFileSize(doc.fileSize)}{doc.courseName ? ` · ${doc.courseName}` : ""}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-card" aria-label="Close viewer"><X className="h-5 w-5" /></button>
        </div>

        <div
          className="relative flex-1 overflow-auto bg-slate-100"
          onContextMenu={(event) => event.preventDefault()}
        >
          {state.status === "loading" && (
            <div className="grid h-full place-items-center text-sm text-muted">
              <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Opening document…</span>
            </div>
          )}
          {state.status === "error" && (
            <div className="grid h-full place-items-center p-6 text-center">
              <div>
                <FileText className="mx-auto h-8 w-8 text-subtle" aria-hidden="true" />
                <p className="mt-3 text-sm font-bold text-primary">{state.message || "Unable to open this document."}</p>
              </div>
            </div>
          )}
          {state.status === "ready" && previewable && (isImage ? (
            <img src={state.url} alt={doc.name} className="mx-auto max-h-full w-auto" />
          ) : (
            <iframe src={state.url} title={doc.name} className="h-full w-full border-0" />
          ))}
          {state.status === "ready" && !previewable && (
            <div className="grid h-full place-items-center p-6 text-center">
              <div>
                <FileText className="mx-auto h-8 w-8 text-subtle" aria-hidden="true" />
                <p className="mt-3 text-sm font-bold text-ink">This file type cannot be previewed here.</p>
                <p className="mt-1 text-xs text-muted">Ask your teacher or the academy office for a copy.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Learner view — modern LMS table, grouped into one section per enrolled
// course. Only courses the student is actually enrolled in appear (the API
// already filtered every document through canAccessDocument against the
// student's real enrollment). A small "Shared directly with you" section
// holds any document an admin assigned to this specific student.
// ---------------------------------------------------------------------------
const DIRECT_SECTION = "Shared directly with you";

function CoursePill({ name }) {
  return <span className="inline-block rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-bold text-success">{name}</span>;
}
function CategoryPill({ value }) {
  if (!value) return <span className="text-xs text-subtle">—</span>;
  return <span className="inline-block rounded-full bg-info-soft px-2.5 py-1 text-[11px] font-bold text-info">{value}</span>;
}
function KindPill({ kind }) {
  return <span className={`inline-block rounded-md px-2 py-1 text-[10px] font-black tracking-wide ${KIND_TONES[kind] || KIND_TONES.FILE}`}>{kind}</span>;
}

function LearnerTable({ docs, onView }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-card shadow-sm">
      <table className="w-full text-left text-sm" style={{ minWidth: "820px" }}>
        <thead className="bg-page text-[10px] font-black uppercase tracking-wider text-muted">
          <tr>
            {["Document", "Course / Training", "Category", "File Type", "Size", "Uploaded", "Status", "Action"].map((head) => (
              <th key={head} className="px-4 py-3">{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => (
            <tr key={doc.id} className="border-t border-border-subtle transition-colors hover:bg-page">
              <td className="px-4 py-3">
                <button type="button" onClick={() => onView(doc)} className="block max-w-[240px] truncate text-left text-sm font-bold text-ink hover:text-primary hover:underline">
                  {doc.name}
                </button>
                {doc.description && <span className="mt-0.5 block max-w-[240px] truncate text-[11px] text-muted">{doc.description}</span>}
                {doc.hasFile === false && <span className="mt-0.5 block text-[11px] font-bold text-warning">File not uploaded yet</span>}
              </td>
              <td className="px-4 py-3">{doc.courseName ? <CoursePill name={doc.courseName} /> : <span className="text-xs text-subtle">General</span>}</td>
              <td className="px-4 py-3"><CategoryPill value={doc.category} /></td>
              <td className="px-4 py-3"><KindPill kind={fileKind(doc.fileType, doc.fileName)} /></td>
              <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-muted">{formatFileSize(doc.fileSize)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-muted">{formatDocDate(doc.createdAt) || "—"}</td>
              <td className="px-4 py-3"><StatusBadge status={doc.status} /></td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onView(doc)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-info px-3 py-1.5 text-[11px] font-bold text-white hover:opacity-90"
                >
                  <Eye className="h-3.5 w-3.5" /> View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LearnerView({ heading, subheading, documents, loading, error, search, onSearch, emptyLabel }) {
  const [viewing, setViewing] = useState(null);

  const sections = useMemo(() => {
    const map = new Map();
    documents.forEach((doc) => {
      const key = doc.courseName || DIRECT_SECTION;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(doc);
    });
    const direct = map.get(DIRECT_SECTION);
    const ordered = [...map.entries()]
      .filter(([key]) => key !== DIRECT_SECTION)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, docs]) => ({ name, docs, general: false }));
    if (direct) ordered.push({ name: DIRECT_SECTION, docs: direct, general: true });
    return ordered;
  }, [documents]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[#bfe6cf] bg-[linear-gradient(120deg,#eafaf1_0%,#f4fbf7_45%,#ffffff_100%)] p-6 text-ink shadow-xl">
        <h2 className="flex items-center gap-2 text-2xl font-black md:text-3xl"><FileText className="h-7 w-7 text-success" aria-hidden="true" /> {heading}</h2>
        <p className="mt-2 text-sm text-muted">{subheading}</p>
      </section>

      <label className="relative block max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-subtle" aria-hidden="true" />
        <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search documents…" className="w-full rounded-xl border border-border-subtle bg-card py-2.5 pl-9 pr-3 text-sm shadow-sm" />
      </label>

      {error && <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>}

      {loading ? (
        <p className="py-12 text-center text-sm text-muted">Loading your documents…</p>
      ) : !documents.length ? (
        <div className="rounded-3xl border border-dashed border-border-subtle bg-card py-16 text-center">
          <FileText className="mx-auto h-8 w-8 text-subtle" aria-hidden="true" />
          <p className="mt-3 font-bold text-ink">{emptyLabel}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.name}>
              <div className="mb-3 flex flex-wrap items-center gap-2.5">
                <span aria-hidden="true">{section.general ? "🟣" : "🟢"}</span>
                <h3 className="text-lg font-black text-ink">{section.name}</h3>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${section.general ? "bg-purple-soft text-purple" : "bg-success-soft text-success"}`}>
                  {section.docs.length} {section.docs.length === 1 ? "Document" : "Documents"}
                </span>
              </div>
              <LearnerTable docs={section.docs} onView={setViewing} />
            </section>
          ))}
        </div>
      )}

      {viewing && <DocViewerModal doc={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manager view
// ---------------------------------------------------------------------------
function StatCard({ label, value }) {
  return (
    <article className="rounded-2xl border border-border-subtle bg-card p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">{label}</p>
      <p className="mt-2 text-2xl font-extrabold text-ink">{value}</p>
    </article>
  );
}

function ManagerView({ payload, loading, error, reload, canManagerControls, courseId, courseName }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [audienceFilter, setAudienceFilter] = useState("All");
  const [courseFilter, setCourseFilter] = useState("all");
  const [folderFilter, setFolderFilter] = useState("all");
  const [formState, setFormState] = useState(null);
  const [detail, setDetail] = useState(null);
  const [folderModal, setFolderModal] = useState(null); // null | "new" | folder object (rename)
  const [folderName, setFolderName] = useState("");
  const [busy, setBusy] = useState(false);
  // Course Details → Materials passes a courseId: this view is then scoped
  // to that one course (list + upload form both locked to it).
  const scoped = Boolean(courseId);

  const documents = useMemo(() => {
    const all = payload.documents || [];
    return scoped ? all.filter((doc) => doc.courseId === courseId) : all;
  }, [payload.documents, scoped, courseId]);
  const folders = payload.folders || [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return documents.filter(
      (doc) =>
        (statusFilter === "All" || doc.status === statusFilter.toLowerCase()) &&
        (audienceFilter === "All" || doc.audienceType === audienceFilter) &&
        (courseFilter === "all" || doc.courseId === courseFilter) &&
        (folderFilter === "all" || doc.folderId === folderFilter) &&
        (!term || `${doc.name} ${doc.description} ${doc.category} ${doc.courseName} ${doc.fileName} ${doc.uploadedByName}`.toLowerCase().includes(term)),
    );
  }, [documents, search, statusFilter, audienceFilter, courseFilter, folderFilter]);

  const counts = useMemo(() => {
    if (scoped || !payload.counts) {
      return {
        total: documents.length,
        published: documents.filter((doc) => doc.status === "published").length,
        draft: documents.filter((doc) => doc.status === "draft").length,
        archived: documents.filter((doc) => doc.status === "archived").length,
      };
    }
    return payload.counts;
  }, [scoped, payload.counts, documents]);

  async function mutate(fn, successMessage) {
    setBusy(true);
    try {
      await fn();
      toast.success(successMessage);
      await reload();
    } catch (mutateError) {
      toast.error(mutateError.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function setStatus(doc, status) {
    return mutate(
      () => updateDocument(doc.id, {
        name: doc.name, description: doc.description, category: doc.category, folderId: doc.folderId,
        courseId: doc.courseId, classId: doc.classId, audienceType: doc.audienceType, audienceIds: doc.audienceIds, status,
      }),
      status === "published" ? "Document published" : status === "archived" ? "Document archived" : "Document set to draft",
    );
  }
  function remove(doc) {
    return confirm({
      title: "Delete document",
      message: `Delete "${doc.name}"? This removes the file for everyone. This cannot be undone.`,
      tone: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => { await deleteDocument(doc.id); toast.success("Document deleted"); await reload(); },
    });
  }
  function removeFolder(folder) {
    return confirm({
      title: "Delete folder",
      message: `Delete the folder "${folder.name}"? Documents inside it are kept, just unfiled.`,
      tone: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => { await deleteFolder(folder.id); toast.success("Folder deleted"); await reload(); },
    });
  }
  function openNewFolder() {
    setFolderName("");
    setFolderModal("new");
  }
  function openRenameFolder(folder) {
    setFolderName(folder.name);
    setFolderModal(folder);
  }
  async function submitFolder(event) {
    event.preventDefault();
    const clean = folderName.trim();
    if (!clean || busy) return;
    if (folderModal === "new") await mutate(() => createFolder(clean), "Folder created");
    else await mutate(() => renameFolder(folderModal.id, clean), "Folder renamed");
    setFolderName("");
    setFolderModal(null);
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 text-ink shadow-xl md:flex-row md:items-center md:justify-between md:p-8">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black md:text-3xl"><FileText className="h-7 w-7 text-primary" aria-hidden="true" /> {scoped ? "Course Documents" : canManagerControls ? "Documents Management" : "Course Learning Materials"}</h2>
          <p className="mt-2 text-sm text-muted">
            {scoped
              ? `Learning materials for ${courseName || "this course"}.`
              : "Learning materials for the whole academy — assign to a course, class, student, role, or everyone."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManagerControls && !scoped && (
            <button type="button" onClick={openNewFolder} className="flex items-center gap-1.5 rounded-xl border border-border-subtle bg-card px-4 py-3 text-xs font-bold text-ink hover:bg-active">
              <FolderPlus className="h-4 w-4" /> New Folder
            </button>
          )}
          <button type="button" onClick={() => setFormState({ initial: { ...BLANK, ...(scoped ? { audienceType: "course", courseId } : {}) }, editing: null })} className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-xs font-bold text-white">
            <Upload className="h-4 w-4" /> {scoped ? "Add Document" : "Upload Document"}
          </button>
        </div>
      </section>

      {canManagerControls && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Documents" value={loading ? "—" : counts.total} />
          <StatCard label="Published" value={loading ? "—" : counts.published} />
          <StatCard label="Draft" value={loading ? "—" : counts.draft} />
          <StatCard label="Archived" value={loading ? "—" : counts.archived} />
        </section>
      )}

      {error && <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>}

      {canManagerControls && !scoped && (
        <section className="rounded-3xl border border-border-subtle bg-card p-4 shadow-sm md:p-5">
          <div className="mb-3 flex items-center justify-between">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-subtle"><Layers className="h-3.5 w-3.5" /> Folders</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setFolderFilter("all")} className={`rounded-full px-3 py-1.5 text-xs font-bold ${folderFilter === "all" ? "bg-ink text-white" : "border border-border-subtle bg-card text-muted hover:border-ink"}`}>All</button>
            {folders.map((folder) => {
              const active = folderFilter === folder.id;
              return (
                <span key={folder.id} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${active ? "bg-ink text-white" : "border border-border-subtle bg-card text-muted"}`}>
                  <button type="button" onClick={() => setFolderFilter(active ? "all" : folder.id)}>📁 {folder.name}</button>
                  {active && (
                    <>
                      <button type="button" onClick={() => openRenameFolder(folder)} aria-label={`Rename ${folder.name}`} className="hover:text-white/70"><Pencil className="h-3 w-3" /></button>
                      <button type="button" onClick={() => removeFolder(folder)} aria-label={`Delete ${folder.name}`} className="hover:text-white/70"><Trash2 className="h-3 w-3" /></button>
                    </>
                  )}
                </span>
              );
            })}
            {!folders.length && <span className="text-xs text-subtle">No folders yet.</span>}
          </div>
        </section>
      )}

      <section className="space-y-4 rounded-3xl border border-border-subtle bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-48 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-subtle" aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search documents…" className="w-full rounded-xl border border-border-subtle bg-page py-2 pl-9 pr-3 text-sm" />
          </label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 text-sm">
            {["All", "Published", "Draft", "Archived"].map((value) => <option key={value}>{value}</option>)}
          </select>
          <select value={audienceFilter} onChange={(event) => setAudienceFilter(event.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 text-sm">
            <option value="All">All audiences</option>
            {Object.entries(AUDIENCE_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
          {!scoped && (
            <select value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)} className="rounded-xl border border-border-subtle px-3 py-2 text-sm">
              <option value="all">All courses</option>
              {(payload.courses || []).map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
            </select>
          )}
          <div className="ml-auto">
            <ExportMenu
              name="documents"
              columns={DOC_EXPORT_COLUMNS}
              pageRows={filtered}
              filteredRows={filtered}
              allRows={documents}
            />
          </div>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-muted">Loading documents…</p>
        ) : !filtered.length ? (
          <p className="py-12 text-center text-sm text-muted">
            {documents.length ? "No documents match your filters." : "No documents yet. Click “Upload Document” to add the first learning material."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" style={{ minWidth: "860px" }}>
              <thead className="border-b text-[10px] uppercase tracking-wider text-subtle">
                <tr>{["Document", "Course", "Audience", "Status", "Date", "Actions"].map((head) => <th key={head} className="p-3">{head}</th>)}</tr>
              </thead>
              <tbody>
                {filtered.map((doc) => (
                  <tr key={doc.id} className="border-b border-border-subtle align-top">
                    <td className="p-3">
                      <div className="flex items-center gap-2.5">
                        <FileBadge kind={fileKind(doc.fileType, doc.fileName)} />
                        <div className="min-w-0">
                          <button type="button" onClick={() => setDetail(doc)} className="block max-w-[220px] truncate text-left text-xs font-bold text-ink hover:underline">{doc.name}</button>
                          <span className="text-[10px] text-subtle">{formatFileSize(doc.fileSize)}{doc.folderName ? ` · 📁 ${doc.folderName}` : ""}</span>
                          {doc.hasFile === false && (
                            <span className="mt-1 block text-[10px] font-bold text-warning">⚠ File missing — edit to re-upload, or delete</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted">{doc.courseName || "—"}</td>
                    <td className="p-3 text-xs text-muted">{AUDIENCE_LABELS[doc.audienceType] || "—"}</td>
                    <td className="p-3"><StatusBadge status={doc.status} /></td>
                    <td className="whitespace-nowrap p-3 text-xs text-muted">{formatDocDate(doc.createdAt)}</td>
                    <td className="whitespace-nowrap p-3 text-xs font-bold">
                      <button type="button" onClick={() => setDetail(doc)} className="text-info hover:underline">View</button>
                      <button type="button" onClick={() => setFormState({ initial: { name: doc.name, description: doc.description, category: doc.category, folderId: doc.folderId, courseId: doc.courseId, classId: doc.classId, audienceType: doc.audienceType, audienceIds: doc.audienceIds, status: doc.status }, editing: doc })} className="ml-3 text-ink hover:underline">Edit</button>
                      {doc.status !== "published" ? (
                        <button type="button" disabled={busy} onClick={() => setStatus(doc, "published")} className="ml-3 text-success hover:underline disabled:opacity-50">Publish</button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => setStatus(doc, "draft")} className="ml-3 text-warning hover:underline disabled:opacity-50">Unpublish</button>
                      )}
                      {canManagerControls && doc.status !== "archived" && (
                        <button type="button" disabled={busy} onClick={() => setStatus(doc, "archived")} className="ml-3 text-muted hover:underline disabled:opacity-50">Archive</button>
                      )}
                      <button type="button" disabled={busy} onClick={() => remove(doc)} className="ml-3 text-primary hover:underline disabled:opacity-50">Delete</button>
                      {doc.fileUrl && <a href={doc.fileUrl} download={doc.fileName || doc.name} className="ml-3 text-ink hover:underline">Download</a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {formState && (
        <Modal title={formState.editing ? "Edit Document" : scoped ? "Add Document" : "Upload Document"} onClose={() => setFormState(null)} wide>
          <DocumentForm
            initial={formState.initial}
            editing={formState.editing}
            data={payload}
            canManagerControls={canManagerControls}
            lockedCourseId={scoped && !formState.editing ? courseId : ""}
            onClose={() => setFormState(null)}
            onSaved={async (message) => { setFormState(null); toast.success(message); await reload(); }}
          />
        </Modal>
      )}
      {detail && <DocumentDetail doc={detail} onClose={() => setDetail(null)} />}
      {folderModal && (
        <Modal title={folderModal === "new" ? "New folder" : "Rename folder"} onClose={() => setFolderModal(null)}>
          <form onSubmit={submitFolder} className="space-y-4">
            <label className="grid gap-1 text-xs font-bold text-muted">
              Folder name
              <input value={folderName} onChange={(event) => setFolderName(event.target.value)} autoFocus maxLength={120} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal" />
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setFolderModal(null)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted">Cancel</button>
              <button disabled={busy || !folderName.trim()} className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                {folderModal === "new" ? "Create folder" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root — one module, role-aware
// ---------------------------------------------------------------------------
export default function DocumentsModule({ role, courseId = "", courseName = "" }) {
  const isManager = role === "Admin" || role === "Director";
  const isStaff = isManager || role === "Teacher" || role === "Facilitator";
  const [payload, setPayload] = useState({ documents: [], folders: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const mounted = useRef(true);

  // Promise-chain (not async/await) so every setState lives in a
  // .then/.catch continuation, never synchronously in the effect body.
  const reload = useCallback(
    () =>
      loadDocuments()
        .then((result) => {
          if (mounted.current) {
            setPayload(result);
            setError("");
          }
        })
        .catch((loadError) => {
          if (mounted.current) setError(loadError.message || "Unable to load documents.");
        })
        .finally(() => {
          if (mounted.current) setLoading(false);
        }),
    [],
  );

  useEffect(() => {
    mounted.current = true;
    reload();
    return () => {
      mounted.current = false;
    };
  }, [reload]);

  if (isStaff) {
    return <ManagerView payload={payload} loading={loading} error={error} reload={reload} canManagerControls={isManager} courseId={courseId} courseName={courseName} />;
  }

  // Student / everyone else: read-only, grouped by course. The API has
  // already filtered `payload.documents` to exactly what this student may
  // see (published + enrolled-course or all-students); this is only a
  // client-side text search on top of that.
  const term = search.trim().toLowerCase();
  const visible = (payload.documents || []).filter(
    (doc) => !term || `${doc.name} ${doc.description} ${doc.courseName} ${doc.fileName} ${doc.category}`.toLowerCase().includes(term),
  );
  return (
    <LearnerView
      heading="My Learning Materials"
      subheading="Documents for the courses you're currently enrolled in. Open a document to read it in the viewer."
      documents={visible}
      loading={loading}
      error={error}
      search={search}
      onSearch={setSearch}
      emptyLabel="No learning materials yet. Your course documents will appear here once your teacher or the academy publishes them."
    />
  );
}
