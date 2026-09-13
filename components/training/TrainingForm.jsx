import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import EnrollmentManager from "./EnrollmentManager";
import { stopEnterSubmit } from "../../lib/ui/keyboard";
import { subscribeActiveCertificateTemplates } from "../../lib/achievement-data";

const statuses = ["Draft", "Upcoming", "Active", "Completed", "Archived"];
const levels = ["Beginner", "Intermediate", "Advanced"];
const enrollmentStatuses = ["Open", "Closed"];
const currencySymbols = { SGD: "S$" };

// This is a long, multi-section form (Basic Info, Pricing, Schedule,
// Instructor, Classroom, Enrollment, Assessment, plus the nested Enrollment
// Manager). Without this, pressing Enter in any single field submits the
// whole form immediately with everything filled in so far and every later
// field left at its default/blank value — which is exactly how a training
// could end up saved with a title but empty Schedule/Classroom fields.
function Field({ label, ...props }) {
  return (
    <label className="grid gap-1 text-xs font-bold text-muted">
      {label}
      <input
        {...props}
        onKeyDown={stopEnterSubmit}
        className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-primary"
      />
    </label>
  );
}
function PriceField({ label, value, onChange, currency, error }) {
  return (
    <label className="grid gap-1 text-xs font-bold text-muted">
      {label}
      <span className="relative block">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-subtle">
          {currencySymbols[currency] || ""}
        </span>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={value}
          onChange={onChange}
          onKeyDown={stopEnterSubmit}
          className={`w-full rounded-xl border px-3 py-2.5 pl-7 text-sm font-normal outline-none focus:ring-2 focus:ring-primary ${error ? "border-primary" : "border-border-subtle"}`}
        />
      </span>
      {error && <span className="text-[11px] font-semibold text-primary">{error}</span>}
    </label>
  );
}
function Section({ title, children }) {
  return (
    <fieldset className="grid gap-3 rounded-2xl border border-border-subtle bg-card p-4 shadow-sm md:p-5">
      <legend className="px-1 text-xs font-black uppercase tracking-wider text-primary">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export default function TrainingForm({
  course,
  teachers,
  saving,
  onCancel,
  onSubmit,
  thumbnailPreview,
  onThumbnailSelect,
  onThumbnailRemove,
}) {
  const fileInputRef = useRef(null);
  // Course only ever references Achievement's own active template list —
  // read-only here, no template creation/editing from inside Training.
  const [certificateTemplates, setCertificateTemplates] = useState([]);
  useEffect(() => subscribeActiveCertificateTemplates(setCertificateTemplates, () => {}), []);
  const set = (key) => (event) => course.setForm({ ...course.form, [key]: event.target.value });
  const setChecked = (key) => (event) => course.setForm({ ...course.form, [key]: event.target.checked });
  const form = course.form;
  const assistantOptions = teachers.filter((teacher) => teacher.id !== form.primaryTeacherId);
  const primaryOptions = teachers.filter((teacher) => teacher.id !== form.assistantTeacherId);

  const priceNum = form.price === "" ? null : Number(form.price);
  const discountNum = form.discountPrice === "" ? null : Number(form.discountPrice);
  const priceError = priceNum !== null && priceNum < 0 ? "Price cannot be negative." : null;
  const discountError =
    discountNum !== null && discountNum < 0
      ? "Discount price cannot be negative."
      : discountNum !== null && priceNum !== null && discountNum > priceNum
        ? "Discount price cannot be greater than course price."
        : null;
  const discountPercent =
    priceNum !== null && priceNum > 0 && discountNum !== null && discountNum >= 0 && discountNum <= priceNum
      ? Math.round(((priceNum - discountNum) / priceNum) * 100)
      : null;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Section title="Basic Information">
        <label className="grid gap-1 text-xs font-bold text-muted">
          Training ID
          <input
            disabled
            value={course.editing?.courseCode || "Auto-generated on save"}
            className="rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm text-muted"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Training Type
          <input disabled value="Offline" className="rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm text-muted" />
        </label>
        <label className="col-span-full grid gap-1 text-xs font-bold text-muted">
          Course / Training Title
          <input value={form.title} onChange={set("title")} onKeyDown={stopEnterSubmit} maxLength={160} required className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal" />
        </label>
        <label className="col-span-full grid gap-1 text-xs font-bold text-muted">
          Description
          <textarea value={form.description} onChange={set("description")} maxLength={5000} rows={3} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal" />
        </label>
        <Field label="Category" value={form.category} onChange={set("category")} maxLength={100} placeholder="e.g. Web Development" />
        <label className="grid gap-1 text-xs font-bold text-muted">
          Level
          <select value={form.level} onChange={set("level")} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm">
            <option value="">Select level</option>
            {levels.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Status
          <select value={form.status} onChange={set("status")} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm">
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <div className="col-span-full grid gap-2">
          <span className="text-xs font-bold text-muted">Thumbnail</span>
          <div className="overflow-hidden rounded-2xl border border-border-subtle bg-page">
            {thumbnailPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnailPreview} alt="Training thumbnail preview" className="aspect-video w-full object-cover" />
            ) : (
              <div className="grid aspect-video w-full place-items-center gap-1 px-4 text-center">
                <ImageIcon className="h-8 w-8 text-subtle" aria-hidden="true" />
                <p className="text-sm font-bold text-ink">No thumbnail</p>
                <p className="text-xs text-muted">Upload a course thumbnail</p>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(event) => onThumbnailSelect?.(event.target.files?.[0] || null)}
            className="hidden"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink transition hover:bg-active hover:text-primary"
            >
              {thumbnailPreview ? "Change Thumbnail" : "Upload Thumbnail"}
            </button>
            {thumbnailPreview && (
              <button
                type="button"
                onClick={() => onThumbnailRemove?.()}
                className="rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-primary transition hover:bg-active"
              >
                Remove
              </button>
            )}
          </div>
          <p className="text-[11px] text-subtle">Recommended: 1280 × 720px, JPG, PNG or WebP</p>
        </div>
      </Section>

      <Section title="Pricing">
        <PriceField label="Course Price" value={form.price} onChange={set("price")} currency={form.currency} error={priceError} />
        <PriceField label="Discount Price (optional)" value={form.discountPrice} onChange={set("discountPrice")} currency={form.currency} error={discountError} />
        {(priceNum === 0 || (discountPercent !== null && discountPercent > 0)) && (
          <div className="col-span-full">
            {priceNum === 0 ? (
              <p className="text-xs font-semibold text-success">This training is Free.</p>
            ) : (
              <p className="text-xs font-semibold text-success">
                {discountPercent}% off — save {currencySymbols[form.currency] || ""}
                {(priceNum - discountNum).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </Section>

      <Section title="Schedule">
        <Field label="Start Date" type="date" value={form.startDate} onChange={set("startDate")} />
        <Field label="End Date" type="date" value={form.endDate} onChange={set("endDate")} />
        <Field label="Start Time" type="time" value={form.startTime} onChange={set("startTime")} />
        <Field label="End Time" type="time" value={form.endTime} onChange={set("endTime")} />
        <Field label="Duration" value={form.duration} onChange={set("duration")} maxLength={60} placeholder="e.g. 8 weeks" />
        <Field label="Class Frequency" value={form.classFrequency} onChange={set("classFrequency")} maxLength={100} placeholder="e.g. Sat, Mon, Wed" />
        <Field label="Total Number of Classes" type="number" min="0" value={form.totalClasses} onChange={set("totalClasses")} />
      </Section>

      <Section title="Instructor">
        <label className="grid gap-1 text-xs font-bold text-muted">
          Primary Teacher
          <select value={form.primaryTeacherId} onChange={set("primaryTeacherId")} required className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm">
            <option value="">Choose primary teacher</option>
            {primaryOptions.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>{teacher.displayName || teacher.email || teacher.id}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold text-muted">
          Assistant Teacher (optional)
          <select value={form.assistantTeacherId} onChange={set("assistantTeacherId")} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm">
            <option value="">None</option>
            {assistantOptions.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>{teacher.displayName || teacher.email || teacher.id}</option>
            ))}
          </select>
        </label>
      </Section>

      <Section title="Physical Classroom">
        <Field label="Campus / Branch" value={form.campus} onChange={set("campus")} maxLength={160} />
        <Field label="Building" value={form.building} onChange={set("building")} maxLength={160} />
        <Field label="Room" value={form.room} onChange={set("room")} maxLength={160} />
        <Field label="Floor" value={form.floor} onChange={set("floor")} maxLength={60} />
        <Field label="Batch / Class Name" value={form.batchName} onChange={set("batchName")} maxLength={160} placeholder="e.g. Batch 12 - Evening" />
        <Field label="Maximum Students" type="number" min="0" value={form.maxStudents} onChange={set("maxStudents")} />
        <Field label="Seat Capacity" type="number" min="0" value={form.seatCapacity} onChange={set("seatCapacity")} />
      </Section>

      <Section title="Enrollment">
        <Field label="Enrollment Start Date" type="date" value={form.enrollmentStartDate} onChange={set("enrollmentStartDate")} />
        <Field label="Enrollment Deadline" type="date" value={form.enrollmentDeadline} onChange={set("enrollmentDeadline")} />
        <label className="grid gap-1 text-xs font-bold text-muted">
          Enrollment Status
          <select value={form.enrollmentStatus} onChange={set("enrollmentStatus")} className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm">
            {enrollmentStatuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        {course.editing && (
          <label className="grid gap-1 text-xs font-bold text-muted">
            Enrolled Students
            <input disabled value={course.editing.enrolled ?? 0} className="rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm text-muted" />
          </label>
        )}
      </Section>

      {course.editing && (
        <Section title="Students / Enrollment Management">
          <div className="col-span-full">
            <EnrollmentManager
              mode="manage"
              courseId={course.editing.id}
              courseTitle={course.editing.title}
              courseCode={course.editing.courseCode || course.editing.id}
            />
          </div>
        </Section>
      )}

      <Section title="Assessment & Certificate">
        <Field label="Passing Score" type="number" min="0" max="100" value={form.passingScore} onChange={set("passingScore")} />
        <label className="flex items-center gap-2 text-xs font-bold text-muted">
          <input type="checkbox" checked={form.certificateEnabled} onChange={setChecked("certificateEnabled")} />
          Certificate Enabled
        </label>
        <Field label="Minimum Attendance % for Certificate" type="number" min="0" max="100" value={form.certificateMinAttendance} onChange={set("certificateMinAttendance")} disabled={!form.certificateEnabled} />
        <Field label="Minimum Passing Score for Certificate" type="number" min="0" max="100" value={form.certificateMinScore} onChange={set("certificateMinScore")} disabled={!form.certificateEnabled} />
        <label className="grid gap-1 text-xs font-bold text-muted">
          Certificate Template
          <select
            value={form.certificateTemplateId}
            onChange={set("certificateTemplateId")}
            disabled={!form.certificateEnabled}
            className="rounded-xl border border-border-subtle px-3 py-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-primary disabled:bg-page disabled:text-subtle"
          >
            <option value="">Choose an active template from Achievement</option>
            {certificateTemplates.map((template) => (
              <option key={template.id} value={template.id}>{template.name} ({template.templateCode})</option>
            ))}
          </select>
          {form.certificateEnabled && !form.certificateTemplateId && (
            <span className="text-[11px] font-semibold text-primary">Certificate is enabled — choose a template, or certificates will not be issued.</span>
          )}
          {form.certificateEnabled && !certificateTemplates.length && (
            <span className="text-[11px] font-semibold text-primary">No active templates yet — create one in Achievement → Templates first.</span>
          )}
        </label>
        <Field label="Certificate Code (e.g. FSWD-2026)" value={form.certificateCode} onChange={set("certificateCode")} disabled={!form.certificateEnabled} />
      </Section>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 text-sm font-bold text-muted">
          Cancel
        </button>
        <button disabled={saving || Boolean(priceError) || Boolean(discountError)} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {saving ? "Saving..." : course.editing ? "Save changes" : "Create Training"}
        </button>
      </div>
    </form>
  );
}
