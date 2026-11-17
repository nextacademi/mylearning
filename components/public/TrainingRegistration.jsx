"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  BookOpen, CalendarDays, ChartPie, CircleCheck, DraftingCompass, FilePen, FileSpreadsheet, FileText,
  GraduationCap, Headphones, Landmark, Laptop, QrCode, ReceiptText, Send, UserRound, WandSparkles, X,
} from "lucide-react";
import {
  COURSE_COLORS,
  DEFAULT_COURSES,
  EDUCATION_OPTIONS,
  RECEIPT_ACCEPT,
  RECEIPT_MAX_BYTES,
  REGISTRATION_EMAIL,
  REGISTRATION_LIMITS,
  formatPrice,
  paymentConfigured,
  validWhatsapp,
} from "../../lib/training-offer";
import { resolvePhoto } from "../../lib/public-assets";
import { AutoCadIcon, ChatGptIcon, ExcelIcon, PowerPointIcon, WordIcon } from "./BrandIcons";

// Homepage "Empower Your Career" course cards + the red "Want to join our
// upcoming training?" banner + the Training Registration popup. Cards and
// payment details are edited in Dashboard → Website (Courses / Payment
// details); submissions land in Dashboard → Registrations.
const NEXT_RED = "#E31B23";
const REVEAL_EASE = [0.16, 1, 0.3, 1];

function Rise({ children, index = 0, className }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 26, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.12, margin: "0px 0px -40px 0px" }}
      transition={{ duration: 0.75, delay: Math.min(index % 5, 4) * 0.08, ease: REVEAL_EASE }}
    >
      {children}
    </motion.div>
  );
}

const theme = (course) => COURSE_COLORS[course.color] || COURSE_COLORS.red;

// Artwork in the middle of each card, picked per course in the editor.
function CourseArt({ course }) {
  const { accent } = theme(course);
  if (course.iconImage) {
    return (
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={resolvePhoto(course.iconImage)} alt="" className="mx-auto h-16 w-16 object-contain" loading="lazy" />
        {course.tagline && <span className="mt-2 block text-xs font-bold" style={{ color: accent }}>{course.tagline}</span>}
      </div>
    );
  }
  const tagline = course.tagline ? (
    <span className="mt-2 inline-block rounded px-2 py-0.5 text-xs font-bold" style={{ color: accent, backgroundColor: `${accent}12` }}>
      {course.tagline}
    </span>
  ) : null;
  switch (course.icon) {
    case "office":
      return (
        <div className="text-center">
          <div className="mb-3 flex justify-center gap-2.5">
            <WordIcon size={40} />
            <ExcelIcon size={40} />
            <PowerPointIcon size={40} />
          </div>
          <Laptop className="mx-auto h-9 w-9" style={{ color: accent }} aria-hidden="true" />
          {tagline}
        </div>
      );
    case "excel":
      return (
        <div className="text-center">
          <div className="mb-3 flex items-center justify-center gap-3">
            <ExcelIcon size={52} />
            <ChartPie className="h-8 w-8" style={{ color: accent }} aria-hidden="true" />
          </div>
          <FileSpreadsheet className="mx-auto h-9 w-9" style={{ color: accent }} aria-hidden="true" />
          {tagline}
        </div>
      );
    case "autocad":
      return (
        <div className="text-center">
          <span className="flex justify-center"><AutoCadIcon size={56} /></span>
          <span className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#6B7280]">
            <DraftingCompass className="h-4 w-4" style={{ color: accent }} aria-hidden="true" />
            {course.tagline || "Drafting & Design"}
          </span>
        </div>
      );
    case "ai":
      return (
        <div className="text-center">
          <div className="mb-1 flex items-center justify-center gap-2">
            <ChatGptIcon size={44} />
            <WandSparkles className="h-7 w-7 text-[#E11D48]" aria-hidden="true" />
          </div>
          {tagline}
        </div>
      );
    case "wpln":
      return (
        <div className="text-center">
          <div className="mb-1 flex items-center justify-center gap-2">
            <Headphones className="h-9 w-9" style={{ color: accent }} aria-hidden="true" />
            <BookOpen className="h-7 w-7 text-[#DC2626]" aria-hidden="true" />
          </div>
          {course.tagline && <span className="mt-1 block text-xs font-bold" style={{ color: accent }}>{course.tagline}</span>}
        </div>
      );
    default:
      return (
        <div className="text-center">
          <GraduationCap className="mx-auto h-10 w-10" style={{ color: accent }} aria-hidden="true" />
          {tagline}
        </div>
      );
  }
}

const courseAnchor = (title) => `course-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;

function CourseCard({ course, onRegister }) {
  const { header, price } = theme(course);
  return (
    <article
      id={courseAnchor(course.title)}
      className={`group relative flex h-full flex-col overflow-hidden rounded-lg border border-red-100 bg-white shadow-xl transition duration-300 hover:-translate-y-1 hover:shadow-2xl ${course.featured ? "ring-2 ring-[#E31B23]/30" : ""}`}
    >
      <div className="flex h-[92px] items-center justify-center px-4 text-center text-white" style={{ backgroundColor: header }}>
        <h3 className="line-clamp-2 text-lg font-black uppercase leading-tight tracking-wide">{course.title}</h3>
      </div>
      <div className="flex min-h-[88px] flex-col items-center justify-center gap-2 border-b border-red-100 bg-red-50/50 px-4 py-3 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#111827] shadow-xs">
          <CalendarDays className="h-3.5 w-3.5" style={{ color: header }} aria-hidden="true" />
          {course.duration}
        </span>
        {course.schedule && (
          <span className="inline-block rounded-full px-3 py-0.5 text-[11px] font-bold uppercase text-white shadow-xs" style={{ backgroundColor: NEXT_RED }}>
            {course.schedule}
          </span>
        )}
      </div>
      <div className="flex flex-1 items-center justify-center bg-white px-5 py-7">
        <CourseArt course={course} />
      </div>
      <div className="py-4 text-center text-2xl font-black tracking-wider text-white" style={{ backgroundColor: price }}>
        {formatPrice(course.price)}
      </div>
      {/* Whole card opens the form with this course picked. */}
      <button
        type="button"
        onClick={() => onRegister(course.id)}
        className="absolute inset-0 rounded-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-[#E31B23]/40"
        aria-label={`Register for ${course.title}`}
      />
    </article>
  );
}

export default function TrainingRegistration({ courses, payment, displayClassName = "" }) {
  const list = Array.isArray(courses) ? courses : DEFAULT_COURSES;
  const [open, setOpen] = useState(false);
  const [initialCourse, setInitialCourse] = useState("");

  if (!list.length) return null;

  function openForm(courseId = "") {
    setInitialCourse(courseId);
    setOpen(true);
  }

  return (
    <section id="courses" className="mx-auto max-w-7xl scroll-mt-16 px-5 py-8 md:px-10 md:py-10">
      <Rise className="text-center">
        <h2 className={`${displayClassName} text-3xl font-black tracking-[-.03em] text-[#111827] md:text-4xl`}>
          Empower Your Career With Professional Skills
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-[#4B5563] md:text-base">
          Explore our upcoming Sunday professional certification courses designed to help you succeed in today&apos;s digital landscape.
        </p>
      </Rise>

      <Rise className="mt-6 md:mt-8">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {list.map((course) => (
            <CourseCard key={course.id || course.title} course={course} onRegister={openForm} />
          ))}
        </div>
      </Rise>

      <Rise className="mt-8 md:mt-10">
        <div className="relative flex flex-col items-center justify-between gap-6 overflow-hidden rounded-xl bg-gradient-to-r from-[#E31B23] via-[#DC2626] to-[#BE123C] p-8 text-white shadow-2xl md:flex-row md:p-12">
          <GraduationCap className="pointer-events-none absolute -bottom-8 -right-6 h-40 w-40 opacity-10" aria-hidden="true" />
          <div className="z-10 text-center md:text-left">
            <span className="mb-3 inline-block rounded-full bg-white/25 px-3 py-1 text-xs font-bold uppercase tracking-wider">Enrollment Open</span>
            <h2 className={`${displayClassName} text-2xl font-black tracking-tight md:text-4xl`}>Want to join our upcoming training?</h2>
            <p className="mt-2 max-w-xl text-sm text-red-100 md:text-base">
              Take the next step in your career growth. Register now for our upcoming training batches and we will contact you over email/WhatsApp.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openForm("")}
            className="z-10 flex shrink-0 items-center gap-3 rounded-lg bg-white px-7 py-4 text-base font-extrabold text-[#E31B23] shadow-xl transition hover:scale-105 hover:bg-gray-100 active:scale-95 md:text-lg"
          >
            <FilePen className="h-5 w-5" aria-hidden="true" />
            Submit a Training Registration
          </button>
        </div>
      </Rise>

      {open && (
        <RegistrationModal
          courses={list}
          payment={payment}
          initialCourse={initialCourse}
          onClose={() => setOpen(false)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Registration popup
// ---------------------------------------------------------------------------
const EMPTY_PERSON = { name: "", title: "", email: "", whatsapp: "" };
const RECEIPT_EXT = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;

const inputClass = (error) =>
  `w-full rounded-lg border ${error ? "border-[#E31B23]" : "border-gray-300"} bg-white px-4 py-3 text-sm text-gray-800 outline-none transition focus:ring-2 focus:ring-[#E31B23] read-only:bg-gray-100 read-only:text-gray-600`;
const labelClass = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-700";

function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs font-semibold text-[#E31B23]">{error}</span>}
    </label>
  );
}

function PersonFields({ prefix, value, errors, onChange, readOnly, placeholders }) {
  const set = (key) => (event) => onChange({ ...value, [key]: event.target.value });
  const err = (key) => errors[`${prefix}.${key}`];
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={`${placeholders.label} ${placeholders.nameLabel} *`} error={err("name")}>
          <input type="text" value={value.name} onChange={set("name")} readOnly={readOnly} maxLength={REGISTRATION_LIMITS.name} autoComplete="name" placeholder={placeholders.name} className={inputClass(err("name"))} />
        </Field>
        <Field label={`${placeholders.label} ${placeholders.titleLabel}`} error={err("title")}>
          <input type="text" value={value.title} onChange={set("title")} readOnly={readOnly} maxLength={REGISTRATION_LIMITS.title} autoComplete="organization-title" placeholder={placeholders.title} className={inputClass(false)} />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label={`${placeholders.label} Email *`} error={err("email")}>
          <input type="email" value={value.email} onChange={set("email")} readOnly={readOnly} maxLength={REGISTRATION_LIMITS.email} autoComplete="email" placeholder={placeholders.email} className={inputClass(err("email"))} />
        </Field>
        <Field label={`${placeholders.label} WhatsApp *`} error={err("whatsapp")}>
          <input type="tel" value={value.whatsapp} onChange={set("whatsapp")} readOnly={readOnly} maxLength={REGISTRATION_LIMITS.whatsapp} autoComplete="tel" placeholder={placeholders.whatsapp} className={inputClass(err("whatsapp"))} />
        </Field>
      </div>
    </>
  );
}

function validatePerson(person, prefix, label) {
  const errors = {};
  if (person.name.trim().length < 2) errors[`${prefix}.name`] = `Enter the ${label}'s full name.`;
  if (!REGISTRATION_EMAIL.test(person.email.trim())) errors[`${prefix}.email`] = "Enter a valid email address.";
  if (!validWhatsapp(person.whatsapp)) errors[`${prefix}.whatsapp`] = "Enter a valid WhatsApp number (8–15 digits).";
  return errors;
}

function formatBytes(size) {
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}

function PaymentBlock({ payment, file, fileError, onFile, required }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const configured = paymentConfigured(payment);
  const bankRows = configured
    ? [["Bank Name", payment.bankName], ["Account Name", payment.accountName], ["Account Number", payment.accountNumber], ["PayNow UEN", payment.paynowUen]].filter(([, value]) => value)
    : [];

  function pick(files) {
    const next = files?.[0];
    if (next) onFile(next);
  }

  return (
    <div className="space-y-4 rounded-lg border border-red-200 bg-red-50/40 p-5">
      <div className="flex items-center justify-between gap-3 border-b border-red-200 pb-3">
        <h4 className="flex items-center text-sm font-black text-gray-900">
          <QrCode className="mr-2 h-5 w-5 text-[#E31B23]" aria-hidden="true" /> Payment Details &amp; Transfer
        </h4>
        {configured && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-[#E31B23]">Scan &amp; Pay</span>}
      </div>

      {configured ? (
        <div className={`grid grid-cols-1 items-center gap-4 ${payment.paynowQr && bankRows.length ? "sm:grid-cols-2" : ""}`}>
          {payment.paynowQr && (
            <div className="rounded-lg border border-gray-200 bg-white p-4 text-center shadow-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resolvePhoto(payment.paynowQr)} alt="PayNow QR code" className="mx-auto h-40 w-40 rounded-lg object-contain" />
              <p className="mt-2 text-[11px] font-bold text-gray-600">Scan with your PayNow banking app</p>
              {payment.paynowUen && <p className="text-[11px] text-gray-500">PayNow UEN: <b className="text-gray-800">{payment.paynowUen}</b></p>}
            </div>
          )}
          {bankRows.length > 0 && (
            <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 text-xs shadow-xs">
              <div className="flex items-center gap-1.5 border-b pb-1 font-bold text-gray-900">
                <Landmark className="h-3.5 w-3.5 text-[#E31B23]" aria-hidden="true" /> Bank Account Transfer:
              </div>
              {bankRows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-gray-500">{label}:</span>
                  <span className="select-all text-right font-semibold text-gray-800">{value}</span>
                </div>
              ))}
            </div>
          )}
          {payment.note && <p className="text-xs leading-5 text-gray-600 sm:col-span-2">{payment.note}</p>}
        </div>
      ) : (
        <p className="rounded-lg border border-gray-200 bg-white p-4 text-xs leading-5 text-gray-600">
          We&apos;ll send you the payment details by email/WhatsApp when we confirm your seat. If you have already paid, you can upload the receipt below.
        </p>
      )}

      <div className="pt-1">
        <span className={labelClass}>Upload Payment Transaction Screenshot (PDF or Image) {required ? "*" : "(optional)"}</span>
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inputRef.current?.click(); } }}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); pick(event.dataTransfer.files); }}
          className={`flex min-h-28 w-full cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-5 text-center transition ${fileError ? "border-[#E31B23] bg-red-50" : dragging ? "border-[#E31B23] bg-red-50" : "border-gray-300 bg-white hover:bg-gray-50"}`}
        >
          {file ? (
            <>
              {file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? (
                <FileText className="mb-2 h-8 w-8 text-[#E31B23]" aria-hidden="true" />
              ) : (
                <ReceiptText className="mb-2 h-8 w-8 text-[#E31B23]" aria-hidden="true" />
              )}
              <p className="break-all text-xs font-semibold text-gray-700">Selected file: {file.name}</p>
              <p className="mt-0.5 text-[10px] text-gray-400">{formatBytes(file.size)} · click to change</p>
            </>
          ) : (
            <>
              <FileText className="mb-2 h-8 w-8 text-[#E31B23]" aria-hidden="true" />
              <p className="text-xs font-semibold text-gray-600">Click to upload or drag &amp; drop payment receipt (PDF/Image)</p>
              <p className="mt-0.5 text-[10px] text-gray-400">Max file size: 10MB</p>
            </>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={RECEIPT_ACCEPT}
          className="hidden"
          onChange={(event) => { pick(event.target.files); event.target.value = ""; }}
        />
        {fileError && <span className="mt-1 block text-xs font-semibold text-[#E31B23]">{fileError}</span>}
      </div>
    </div>
  );
}

function RegistrationModal({ courses, payment, initialCourse, onClose }) {
  const titleId = useId();
  const [startedAt] = useState(() => Date.now());
  const [courseId, setCourseId] = useState(initialCourse || "");
  const [trainee, setTrainee] = useState(EMPTY_PERSON);
  const [requester, setRequester] = useState(EMPTY_PERSON);
  const [sameAsTrainee, setSameAsTrainee] = useState(false);
  const [company, setCompany] = useState("");
  const [education, setEducation] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | submitting | success
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState("");
  const scrollRef = useRef(null);
  const firstFieldRef = useRef(null);
  const receiptRequired = paymentConfigured(payment);
  const payer = sameAsTrainee ? trainee : requester;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFieldRef.current?.focus();
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape" && status !== "submitting") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, status]);

  function toggleSame(checked) {
    // Unticking keeps the copied details, now editable (as in the mockup).
    if (!checked) setRequester(trainee);
    setSameAsTrainee(checked);
  }

  function chooseFile(next) {
    if (next.size > RECEIPT_MAX_BYTES) {
      setFile(null);
      setFileError("This file is larger than 10 MB. Please upload a smaller screenshot or PDF.");
      return;
    }
    if (!/^(application\/pdf|image\/)/.test(next.type) && !RECEIPT_EXT.test(next.name)) {
      setFile(null);
      setFileError("Upload a PDF or an image (JPG, PNG, WEBP or HEIC).");
      return;
    }
    setFile(next);
    setFileError("");
  }

  function validate() {
    const next = {
      ...(courseId ? {} : { courseId: "Choose a course." }),
      ...validatePerson(trainee, "trainee", "trainee"),
      ...(sameAsTrainee ? {} : validatePerson(requester, "requester", "requester")),
      ...(education ? {} : { education: "Choose your latest education." }),
    };
    setErrors(next);
    const fileMissing = receiptRequired && !file;
    setFileError(fileMissing ? "Upload your payment receipt." : fileError);
    return !Object.keys(next).length && !fileMissing && !(file && fileError);
  }

  async function submit(event) {
    event.preventDefault();
    if (status === "submitting") return;
    setMessage("");
    if (!validate()) {
      setMessage("Please check the highlighted fields.");
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setStatus("submitting");
    try {
      const body = new FormData();
      body.append("data", JSON.stringify({ courseId, trainee, sameAsTrainee, requester: payer, company, education, startedAt, website }));
      if (file) body.append("receipt", file);
      const response = await fetch("/api/public/training-registration", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "We couldn't submit your registration. Please try again.");
      setReference(data.ref || "");
      setStatus("success");
      scrollRef.current?.scrollTo({ top: 0 });
    } catch (error) {
      setStatus("idle");
      setMessage(error.message || "We couldn't submit your registration. Please try again.");
      scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const close = () => { if (status !== "submitting") onClose(); };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-xs sm:items-center"
      data-lenis-prevent
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="my-8 w-full max-w-2xl overflow-hidden rounded-xl bg-white text-left shadow-2xl">
        <div className="flex items-center justify-between gap-4 p-6 text-white" style={{ backgroundColor: NEXT_RED }}>
          <div>
            <h3 id={titleId} className="text-xl font-black tracking-wide">Training Registration Form</h3>
            <p className="mt-0.5 text-xs text-red-100">Fill out your details below to secure your spot for the upcoming session.</p>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/20 text-white transition hover:bg-white/30">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {status === "success" ? (
          <div className="space-y-4 p-10 text-center">
            <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-green-100 text-green-600 shadow-inner">
              <CircleCheck className="h-10 w-10" aria-hidden="true" />
            </div>
            <h4 className="text-2xl font-black text-gray-900">{file ? "Registration & Receipt Submitted!" : "Registration Submitted!"}</h4>
            <p className="mx-auto max-w-md text-sm text-gray-600">
              Thank you for registering with Next Academy SG. {file ? "We have received your payment receipt and will" : "We will"} contact you over email/WhatsApp shortly to confirm your enrollment.
            </p>
            {reference && (
              <p className="text-sm text-gray-600">Your reference: <b className="font-mono text-gray-900">{reference}</b></p>
            )}
            <div className="pt-4">
              <button type="button" onClick={onClose} className="rounded-lg bg-gray-900 px-8 py-3 font-bold text-white transition hover:bg-black">Close Window</button>
            </div>
          </div>
        ) : (
          <form ref={scrollRef} onSubmit={submit} noValidate className="max-h-[75vh] space-y-6 overflow-y-auto p-6 md:p-8">
            {message && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-[#B91C1C]">{message}</p>}

            <Field label="Select Course *" error={errors.courseId}>
              <select ref={firstFieldRef} value={courseId} onChange={(event) => setCourseId(event.target.value)} className={`${inputClass(errors.courseId)} bg-gray-50`}>
                <option value="">-- Choose a Course --</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title} ({formatPrice(course.price)}){course.duration ? ` - ${course.duration}` : ""}
                  </option>
                ))}
              </select>
            </Field>

            <div className="space-y-4 rounded-lg border border-red-100 bg-red-50/60 p-4">
              <h4 className="flex items-center text-xs font-black uppercase tracking-wider text-[#E31B23]">
                <GraduationCap className="mr-2 h-4 w-4" aria-hidden="true" /> Trainee / Student Details
              </h4>
              <PersonFields
                prefix="trainee"
                value={trainee}
                errors={errors}
                onChange={setTrainee}
                placeholders={{ label: "Trainee", nameLabel: "Full Name", titleLabel: "Job Title / Designation", name: "e.g. John Tan", title: "e.g. Administrative Executive", email: "e.g. john@example.com", whatsapp: "e.g. +65 9123 4567" }}
              />
            </div>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3.5">
              <input type="checkbox" checked={sameAsTrainee} onChange={(event) => toggleSame(event.target.checked)} className="h-5 w-5 cursor-pointer rounded border-gray-300 accent-[#E31B23]" />
              <span className="text-xs font-semibold text-gray-800 md:text-sm">Requester (Payer) is the same person as the trainee (Auto-fill contact details)</span>
            </label>

            <div className={`space-y-4 rounded-lg border border-gray-200 p-4 transition ${sameAsTrainee ? "bg-gray-100 opacity-75" : "bg-gray-50"}`}>
              <h4 className="flex items-center text-xs font-black uppercase tracking-wider text-gray-700">
                <UserRound className="mr-2 h-4 w-4" aria-hidden="true" /> Requester / Payer Details
              </h4>
              <PersonFields
                prefix="requester"
                value={payer}
                errors={sameAsTrainee ? {} : errors}
                onChange={setRequester}
                readOnly={sameAsTrainee}
                placeholders={{ label: "Requester", nameLabel: "Name", titleLabel: "Title", name: "e.g. Sarah Tan", title: "e.g. HR Manager / Self", email: "e.g. sarah@example.com", whatsapp: "e.g. +65 9876 5432" }}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Company / Organization">
                <input type="text" value={company} onChange={(event) => setCompany(event.target.value)} maxLength={REGISTRATION_LIMITS.company} autoComplete="organization" placeholder="e.g. Next Academy Pte Ltd" className={`${inputClass(false)} bg-gray-50`} />
              </Field>
              <Field label="Latest Education *" error={errors.education}>
                <select value={education} onChange={(event) => setEducation(event.target.value)} className={`${inputClass(errors.education)} bg-gray-50`}>
                  <option value="">-- Select Highest Qualification --</option>
                  {EDUCATION_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </Field>
            </div>

            {/* Honeypot — hidden from people, tempting to bots. */}
            <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>Website<input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
            </div>

            <PaymentBlock payment={payment} file={file} fileError={fileError} onFile={chooseFile} required={receiptRequired} />

            <div className="pt-1">
              <button
                type="submit"
                disabled={status === "submitting"}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#E31B23] py-4 text-base font-extrabold text-white shadow-lg transition hover:bg-[#B91C1C] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-70"
              >
                <Send className="h-5 w-5" aria-hidden="true" />
                {status === "submitting" ? "Submitting…" : file || receiptRequired ? "Submit Registration & Payment" : "Submit Registration"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
