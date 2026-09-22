"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Info, ListChecks } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { APPOINTMENT_PURPOSES, EVENING_SLOTS, MORNING_SLOTS, slotIndex, slotMinutes } from "../../lib/appointments-shared";
import {
  bookAppointment, cancelAppointment, completeAppointment, loadAppointments, loadBookedSlots, rescheduleAppointment,
} from "../../lib/services/appointment-service";
import DataTable, { StatusBadge } from "../data-table/DataTable";
import { formatDate } from "../training/PaymentHistoryTable";
import { SkeletonList } from "../ui/Skeleton";
import { useConfirm } from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";

const pad = (value) => String(value).padStart(2, "0");
const toDateStr = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;
function localToday() {
  const now = new Date();
  return toDateStr(now.getFullYear(), now.getMonth(), now.getDate());
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const FIELD = "w-full rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary";
const LABEL = "grid gap-1 text-xs font-bold text-muted";
const STATUS_TONE = { booked: "green", completed: "blue", cancelled: "red" };

function MonthCalendar({ viewMonth, onMonthChange, selectedDate, onSelect, today }) {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const leadingBlanks = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const atCurrentMonth = year === todayYear && month === todayMonth - 1;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-bold text-ink">{viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous month" disabled={atCurrentMonth} onClick={() => onMonthChange(-1)} className="grid h-8 w-8 place-items-center rounded-lg border border-border-subtle bg-card text-muted hover:bg-active disabled:opacity-40">
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => onMonthChange(1)} className="grid h-8 w-8 place-items-center rounded-lg border border-border-subtle bg-card text-muted hover:bg-active">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="mb-2 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => <span key={day} className="text-xs font-semibold text-subtle">{day}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {Array.from({ length: leadingBlanks }, (_, index) => <div key={`blank-${index}`} />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          const value = toDateStr(year, month, day);
          const past = value < today;
          const selected = value === selectedDate;
          return (
            <button
              key={value}
              type="button"
              disabled={past}
              aria-pressed={selected}
              onClick={() => onSelect(value)}
              className={`mx-auto grid h-9 w-9 place-items-center rounded-xl text-xs font-medium transition ${
                selected ? "bg-primary font-bold text-white shadow-md" : past ? "cursor-not-allowed text-subtle opacity-40" : `text-ink hover:bg-active ${value === today ? "ring-1 ring-primary" : ""}`
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SlotGroup({ title, slots, booked, passed, selected, onPick }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-subtle">{title}</p>
      <div className="flex flex-wrap gap-2.5">
        {slots.map((slot) => {
          const taken = booked.includes(slot);
          const unavailable = taken || passed(slot);
          return (
            <button
              key={slot}
              type="button"
              disabled={unavailable}
              aria-pressed={selected === slot}
              onClick={() => onPick(slot)}
              className={`rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                selected === slot ? "bg-primary font-bold text-white shadow-md" : unavailable ? "cursor-not-allowed border border-border-subtle bg-page text-subtle line-through opacity-60" : "border border-border-subtle bg-card text-ink hover:bg-active"
              }`}
              title={taken ? "Already booked" : undefined}
            >
              {slot}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const blankForm = { name: "", phone: "", email: "", courseId: "", type: "Enquiry", studentId: "", purpose: "Consultation", assignedTo: "", notes: "" };

// "14:05" (native <input type="time">) -> "2:05 PM", matching the
// "h:mm AM/PM" format used everywhere else (slots, slotMinutes, etc).
function to12Hour(hhmm) {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return "";
  const [hourStr, minute] = hhmm.split(":");
  const hour = Number(hourStr);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

function statusLabel(status) {
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return "Upcoming";
}

// Consultation booking + appointment management. Everyone can book and see
// their own bookings; Director/Admin also see everyone's, book on behalf
// of a student or a walk-in/phone enquiry, assign staff, and manage the
// full lifecycle (reschedule / cancel / mark completed) from a details
// view — that management table is their primary screen; booking a new one
// is a secondary "Book Appointment" screen, same as a typical admin panel.
// All rules (one booking per slot, only open courses, own-records only,
// manager-only actions) are enforced server-side in
// lib/server/appointment-core.js.
export default function AppointmentScheduler() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const isManager = profile?.role === "Admin" || profile?.role === "Director";
  const today = localToday();

  const [tab, setTab] = useState(() => (isManager ? "list" : "book"));
  const [appointments, setAppointments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [bookedTimes, setBookedTimes] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [form, setForm] = useState(() => (isManager ? blankForm : { ...blankForm, name: profile?.displayName || user?.displayName || "", phone: profile?.phone || "", email: user?.email || "" }));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const latestDate = useRef("");

  const load = useCallback(() => {
    loadAppointments()
      .then((data) => {
        setAppointments(data.appointments || []);
        setCourses(data.courses || []);
        setStudents(data.students || []);
        setStaff(data.staff || []);
        setError("");
      })
      .catch((err) => setError(err.message || "Unable to load appointments."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  function selectDate(date) {
    latestDate.current = date;
    setSelectedDate(date);
    setSelectedTime("");
    setCustomTime("");
    setBookedTimes([]);
    setMessage("");
    setSlotsLoading(true);
    // A failed lookup just leaves every slot enabled — the server re-checks
    // availability when the booking is submitted anyway.
    loadBookedSlots(date)
      .then((data) => {
        if (latestDate.current === date) setBookedTimes(data.booked || []);
      })
      .catch(() => {})
      .finally(() => {
        if (latestDate.current === date) setSlotsLoading(false);
      });
  }

  function pickSlot(slot) {
    setCustomTime("");
    setSelectedTime(slot);
  }

  function pickStudent(studentId) {
    const student = students.find((entry) => entry.id === studentId);
    setForm((current) => ({
      ...current,
      studentId,
      name: student?.name || current.name,
      email: student?.email || current.email,
      phone: student?.phone || current.phone,
    }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedDate || !selectedTime) return;
    setSubmitting(true);
    setMessage("");
    try {
      await bookAppointment({ ...form, studentId: form.type === "Student" ? form.studentId : "", date: selectedDate, time: selectedTime });
      toast.success("Appointment booked successfully");
      setSelectedDate(null);
      setSelectedTime("");
      setCustomTime("");
      setBookedTimes([]);
      setForm(isManager ? blankForm : { ...form, courseId: "" });
      load();
      setTab("list");
    } catch (err) {
      setMessage(err.message || "Unable to book this appointment.");
      // Most likely someone took the slot first — refresh so it shows as taken.
      const data = await loadBookedSlots(selectedDate).catch(() => null);
      if (data) {
        setBookedTimes(data.booked || []);
        if ((data.booked || []).includes(selectedTime)) setSelectedTime("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function cancel(row) {
    return confirm({
      title: "Cancel appointment",
      message: `Cancel the ${row.time} consultation on ${formatDate(row.date)} for ${row.name}?`,
      tone: "danger",
      confirmLabel: "Cancel Appointment",
      onConfirm: async () => {
        try {
          await cancelAppointment(row.id);
          toast.success("Appointment cancelled");
          setViewing(null);
          load();
        } catch (err) {
          toast.error(err.message || "Unable to cancel this appointment.");
        }
      },
    });
  }

  function complete(row) {
    return confirm({
      title: "Mark as completed",
      message: `Mark the ${row.time} consultation on ${formatDate(row.date)} for ${row.name} as completed?`,
      confirmLabel: "Mark Completed",
      onConfirm: async () => {
        try {
          await completeAppointment(row.id);
          toast.success("Appointment marked as completed");
          setViewing(null);
          load();
        } catch (err) {
          toast.error(err.message || "Unable to update this appointment.");
        }
      },
    });
  }

  // ---- Details / reschedule modal ----
  const [viewing, setViewing] = useState(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [rescheduleMessage, setRescheduleMessage] = useState("");

  function openDetails(row) {
    setViewing(row);
    setRescheduling(false);
    setRescheduleDate(row.date);
    setRescheduleTime("");
    setRescheduleMessage("");
  }

  async function submitReschedule(event) {
    event.preventDefault();
    const time = to12Hour(rescheduleTime);
    if (!rescheduleDate || !time) return;
    setRescheduleSaving(true);
    setRescheduleMessage("");
    try {
      await rescheduleAppointment(viewing.id, { date: rescheduleDate, time });
      toast.success("Appointment rescheduled");
      setViewing(null);
      load();
    } catch (err) {
      setRescheduleMessage(err.message || "Unable to reschedule this appointment.");
    } finally {
      setRescheduleSaving(false);
    }
  }

  const columns = useMemo(() => [
    { key: "date", header: "Date", sortable: true, accessor: (a) => `${a.date} ${String(slotIndex(a.time)).padStart(2, "0")}`, render: (a) => formatDate(a.date) },
    { key: "time", header: "Time", accessor: (a) => a.time },
    {
      key: "name",
      header: "Student / Enquiry",
      sortable: true,
      accessor: (a) => `${a.name} ${a.email}`,
      render: (a) => (
        <span>
          <b className="block text-ink">{a.name}</b>
          <span className="text-[11px] text-muted">{a.type === "Student" ? "Student" : "Enquiry"} · {a.email}</span>
        </span>
      ),
      exportValue: (a) => a.name,
    },
    { key: "purpose", header: "Purpose", sortable: true, filter: {}, accessor: (a) => a.purpose || "Consultation" },
    { key: "assignedToName", header: "Assigned To", filter: {}, accessor: (a) => a.assignedToName || "Unassigned" },
    {
      key: "status",
      header: "Status",
      sortable: true,
      filter: {},
      accessor: (a) => statusLabel(a.status),
      render: (a) => <StatusBadge tone={STATUS_TONE[a.status] || "gray"}>{statusLabel(a.status)}</StatusBadge>,
    },
  ], []);

  const filteredAppointments = useMemo(
    () => (dateFilter ? appointments.filter((a) => a.date === dateFilter) : appointments),
    [appointments, dateFilter],
  );

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const slotPassed = (slot) => selectedDate === today && slotMinutes(slot) <= nowMinutes;
  const selectedDateTitle = selectedDate
    ? (() => {
        const [year, month, day] = selectedDate.split("-").map(Number);
        return new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
      })()
    : "";
  const canSubmit =
    !submitting && selectedDate && selectedTime && form.name.trim() && form.phone.trim() && form.email.trim() && form.courseId &&
    (form.type !== "Student" || form.studentId);

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2 rounded-2xl border border-border-subtle bg-card p-2 shadow-sm">
        {[
          { id: "list", label: `${isManager ? "All Appointments" : "My Appointments"} (${appointments.filter((a) => a.status !== "cancelled").length})`, icon: ListChecks },
          { id: "book", label: "Book Appointment", icon: CalendarDays },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold ${tab === id ? "bg-primary text-white" : "text-muted hover:bg-active"}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {error && <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>}

      {tab === "list" && (
        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-bold text-ink">{isManager ? "Scheduled Consultations" : "My Consultations"}</h2>
            <p className="text-xs text-muted">{isManager ? "Every appointment — search by name, email or purpose, or open one to reschedule/cancel/complete it." : "The consultations you have booked."}</p>
          </div>
          {loading ? (
            <SkeletonList count={6} />
          ) : (
            <DataTable
              title="appointments"
              name="appointments"
              columns={columns}
              rows={filteredAppointments}
              initialSort={{ key: "date", dir: "desc" }}
              pageSize={10}
              emptyLabel="No appointments yet."
              onRowClick={openDetails}
              toolbar={
                <label className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="rounded-xl border border-border-subtle bg-card px-3 py-2 text-xs font-semibold text-ink outline-none focus:ring-2 focus:ring-primary"
                  />
                  {dateFilter && (
                    <button type="button" onClick={() => setDateFilter("")} className="text-xs font-bold text-muted hover:underline">Clear</button>
                  )}
                </label>
              }
              rowActions={(row) => (
                <button type="button" onClick={() => openDetails(row)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-page">
                  View
                </button>
              )}
            />
          )}
        </section>
      )}

      {tab === "book" && (
        <div className="grid overflow-hidden rounded-3xl border border-border-subtle bg-card shadow-sm md:grid-cols-12">
          <div className="border-b border-border-subtle bg-page p-6 sm:p-8 md:col-span-5 md:border-b-0 md:border-r">
            <h2 className="mb-1 text-xl font-bold text-ink">Book an Appointment</h2>
            <p className="mb-6 text-xs text-muted">{isManager ? "Book a consultation on behalf of a student or enquiry." : "Choose a date and time to talk to an advisor about a course."}</p>

            {isManager && (
              <div className="mb-6 space-y-4 border-b border-border-subtle pb-6">
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-border-subtle bg-card p-1">
                  {["Enquiry", "Student"].map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, type: option, studentId: "", name: "", email: "", phone: "" }))}
                      className={`rounded-lg py-2 text-xs font-bold transition ${form.type === option ? "bg-primary text-white" : "text-muted hover:bg-active"}`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {form.type === "Student" && (
                  <label className={LABEL}>
                    Student
                    <select value={form.studentId} onChange={(e) => pickStudent(e.target.value)} className={FIELD}>
                      <option value="">{students.length ? "Search / select a student…" : "No students found"}</option>
                      {students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}
                    </select>
                  </label>
                )}
                <label className={LABEL}>
                  Appointment Type
                  <select value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className={FIELD}>
                    {APPOINTMENT_PURPOSES.map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}
                  </select>
                </label>
                <label className={LABEL}>
                  Assigned Staff
                  <select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })} className={FIELD}>
                    <option value="">Unassigned</option>
                    {staff.map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role}</option>)}
                  </select>
                </label>
              </div>
            )}

            <MonthCalendar
              viewMonth={viewMonth}
              onMonthChange={(delta) => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1))}
              selectedDate={selectedDate}
              onSelect={selectDate}
              today={today}
            />
            <p className="mt-6 border-t border-border-subtle pt-4 text-xs text-subtle">Times are shown in the academy&apos;s local time.</p>
          </div>

          <div className="space-y-6 p-6 sm:p-8 md:col-span-7">
            {!selectedDate ? (
              <p className="flex items-center gap-2 rounded-xl border border-border-subtle bg-page p-4 text-xs text-muted">
                <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                Pick a date on the calendar to see the available times.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-ink">{selectedDateTitle}</h3>
                  {slotsLoading && <span className="text-xs text-muted">Checking availability…</span>}
                </div>
                <SlotGroup title="Morning Sessions" slots={MORNING_SLOTS} booked={bookedTimes} passed={slotPassed} selected={selectedTime} onPick={pickSlot} />
                <SlotGroup title="Evening Sessions" slots={EVENING_SLOTS} booked={bookedTimes} passed={slotPassed} selected={selectedTime} onPick={pickSlot} />

                {isManager && (
                  <div className="space-y-2 border-t border-border-subtle pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-subtle">Or set a custom time</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        value={customTime}
                        onChange={(e) => setCustomTime(e.target.value)}
                        className="rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        type="button"
                        disabled={!customTime}
                        onClick={() => setSelectedTime(to12Hour(customTime))}
                        className={`rounded-xl border px-4 py-2.5 text-xs font-bold transition disabled:opacity-50 ${selectedTime && selectedTime === to12Hour(customTime) ? "border-primary bg-primary text-white" : "border-border-subtle text-ink hover:bg-active"}`}
                      >
                        Use this time
                      </button>
                      {selectedTime && selectedTime === to12Hour(customTime) && (
                        <span className="text-xs font-semibold text-primary">Selected: {selectedTime}</span>
                      )}
                    </div>
                  </div>
                )}

                {message && <p className="rounded-xl bg-active px-3 py-2 text-xs text-primary">{message}</p>}

                {selectedTime ? (
                  <form onSubmit={submit} className="space-y-4 border-t border-border-subtle pt-6">
                    <h4 className="text-sm font-bold text-primary">{form.type === "Student" ? "Student" : "Enquiry"} details for {selectedTime}</h4>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className={LABEL}>
                        Full Name
                        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Alex Johnson" className={FIELD} />
                      </label>
                      <label className={LABEL}>
                        Phone Number
                        <input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+65 8123 4567" className={FIELD} />
                      </label>
                      <label className={LABEL}>
                        Email Address
                        <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="alex@example.com" className={FIELD} />
                      </label>
                      <label className={LABEL}>
                        Training / Course
                        <select required value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className={FIELD}>
                          <option value="">{courses.length ? "Select a course…" : "No trainings open right now"}</option>
                          {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
                        </select>
                      </label>
                    </div>
                    {isManager && (
                      <label className={LABEL}>
                        Notes
                        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Anything worth noting before the consultation…" className={FIELD} />
                      </label>
                    )}
                    <div className="flex justify-end">
                      <button type="submit" disabled={!canSubmit} className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white disabled:opacity-60">
                        {submitting ? "Booking…" : "Confirm & Book Consultation"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="flex items-center gap-2 rounded-xl border border-border-subtle bg-page p-4 text-xs text-muted">
                    <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    Select an available time slot to enter the details.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-3xl bg-card p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-ink">{viewing.name}</h3>
                <p className="text-xs text-muted">{viewing.type === "Student" ? "Student" : "Enquiry"} · {viewing.email} · {viewing.phone}</p>
              </div>
              <button type="button" onClick={() => setViewing(null)} className="text-xl text-muted" aria-label="Close">×</button>
            </div>

            <div className="grid grid-cols-2 gap-4 rounded-2xl border border-border-subtle bg-page p-4 text-sm">
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Date &amp; Time</p><p className="font-bold text-ink">{formatDate(viewing.date)} · {viewing.time}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Status</p><StatusBadge tone={STATUS_TONE[viewing.status] || "gray"}>{statusLabel(viewing.status)}</StatusBadge></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Purpose</p><p className="font-bold text-ink">{viewing.purpose || "Consultation"}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Course</p><p className="font-bold text-ink">{viewing.courseTitle || "—"}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Assigned To</p><p className="font-bold text-ink">{viewing.assignedToName || "Unassigned"}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Created By</p><p className="font-bold text-ink">{viewing.bookedByStaff ? "Staff" : "Self-booked"}</p></div>
              {viewing.rescheduledFrom && (
                <div className="col-span-2"><p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Rescheduled From</p><p className="font-bold text-ink">{formatDate(viewing.rescheduledFrom.date)} · {viewing.rescheduledFrom.time}</p></div>
              )}
              {viewing.notes && (
                <div className="col-span-2"><p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Notes</p><p className="text-ink">{viewing.notes}</p></div>
              )}
            </div>

            {isManager && viewing.status === "booked" && !rescheduling && (
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button type="button" onClick={() => setRescheduling(true)} className="rounded-xl border border-border-subtle px-4 py-2 text-xs font-bold text-ink hover:bg-page">Reschedule</button>
                <button type="button" onClick={() => complete(viewing)} className="rounded-xl border border-border-subtle px-4 py-2 text-xs font-bold text-ink hover:bg-page">Mark as Completed</button>
                <button type="button" onClick={() => cancel(viewing)} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">Cancel</button>
              </div>
            )}
            {!isManager && viewing.status === "booked" && (
              <div className="flex justify-end pt-2">
                <button type="button" onClick={() => cancel(viewing)} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white">Cancel Appointment</button>
              </div>
            )}

            {rescheduling && (
              <form onSubmit={submitReschedule} className="space-y-3 border-t border-border-subtle pt-4">
                <h4 className="text-sm font-bold text-ink">New date &amp; time</h4>
                <div className="grid grid-cols-2 gap-3">
                  <label className={LABEL}>
                    Date
                    <input required type="date" min={today} value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} className={FIELD} />
                  </label>
                  <label className={LABEL}>
                    Time
                    <input required type="time" value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} className={FIELD} />
                  </label>
                </div>
                {rescheduleMessage && <p className="rounded-xl bg-active px-3 py-2 text-xs text-primary">{rescheduleMessage}</p>}
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setRescheduling(false)} disabled={rescheduleSaving} className="rounded-xl border border-border-subtle px-4 py-2 text-xs font-bold text-ink">Cancel</button>
                  <button type="submit" disabled={rescheduleSaving} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{rescheduleSaving ? "Saving…" : "Save New Time"}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
