"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Info, ListChecks } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { EVENING_SLOTS, MORNING_SLOTS, slotIndex, slotMinutes } from "../../lib/appointments-shared";
import { bookAppointment, cancelAppointment, loadAppointments, loadBookedSlots } from "../../lib/services/appointment-service";
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

const blankForm = { name: "", phone: "", email: "", courseId: "" };

// Consultation booking + appointment list. Everyone can book and see their
// own bookings; Director/Admin also see (and can cancel) everyone's, and
// book on behalf of a walk-in or phone enquiry — the form isn't prefilled
// for them. All rules (one booking per slot, only open courses, own-records
// only) are enforced server-side in lib/server/appointment-core.js.
export default function AppointmentScheduler() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const isManager = profile?.role === "Admin" || profile?.role === "Director";
  const today = localToday();

  const [tab, setTab] = useState("book");
  const [appointments, setAppointments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [bookedTimes, setBookedTimes] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState("");
  const [form, setForm] = useState(() => (isManager ? blankForm : { name: profile?.displayName || user?.displayName || "", phone: profile?.phone || "", email: user?.email || "", courseId: "" }));
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const latestDate = useRef("");

  const load = useCallback(() => {
    loadAppointments()
      .then((data) => {
        setAppointments(data.appointments || []);
        setCourses(data.courses || []);
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

  async function submit(event) {
    event.preventDefault();
    if (!selectedDate || !selectedTime) return;
    setSubmitting(true);
    setMessage("");
    try {
      await bookAppointment({ ...form, date: selectedDate, time: selectedTime });
      toast.success("Appointment booked successfully");
      setSelectedDate(null);
      setSelectedTime("");
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
          load();
        } catch (err) {
          toast.error(err.message || "Unable to cancel this appointment.");
        }
      },
    });
  }

  const columns = useMemo(() => [
    {
      key: "dateTime",
      header: "Date & Time",
      sortable: true,
      accessor: (a) => `${a.date} ${String(slotIndex(a.time)).padStart(2, "0")}`,
      render: (a) => <span><b className="block text-ink">{formatDate(a.date)}</b><span className="text-[11px] text-muted">{a.time}</span></span>,
      exportValue: (a) => `${a.date} ${a.time}`,
    },
    {
      key: "name",
      header: "Student",
      sortable: true,
      accessor: (a) => `${a.name} ${a.email}`,
      render: (a) => <span><b className="block text-ink">{a.name}</b><span className="text-[11px] text-muted">{a.email}</span></span>,
      exportValue: (a) => a.name,
    },
    { key: "phone", header: "Phone", accessor: (a) => a.phone || "" },
    { key: "courseTitle", header: "Course", sortable: true, filter: {}, accessor: (a) => a.courseTitle || "" },
    {
      key: "status",
      header: "Status",
      sortable: true,
      filter: {},
      accessor: (a) => (a.status === "cancelled" ? "Cancelled" : "Booked"),
      render: (a) => <StatusBadge tone={a.status === "cancelled" ? "red" : "green"}>{a.status === "cancelled" ? "Cancelled" : "Booked"}</StatusBadge>,
    },
  ], []);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const slotPassed = (slot) => selectedDate === today && slotMinutes(slot) <= nowMinutes;
  const selectedDateTitle = selectedDate
    ? (() => {
        const [year, month, day] = selectedDate.split("-").map(Number);
        return new Date(year, month - 1, day).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
      })()
    : "";
  const canSubmit = !submitting && selectedDate && selectedTime && form.name.trim() && form.phone.trim() && form.email.trim() && form.courseId;

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2 rounded-2xl border border-border-subtle bg-card p-2 shadow-sm">
        {[
          { id: "book", label: "Book Appointment", icon: CalendarDays },
          { id: "list", label: `${isManager ? "All Appointments" : "My Appointments"} (${appointments.filter((a) => a.status !== "cancelled").length})`, icon: ListChecks },
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

      {tab === "book" && (
        <div className="grid overflow-hidden rounded-3xl border border-border-subtle bg-card shadow-sm md:grid-cols-12">
          <div className="border-b border-border-subtle bg-page p-6 sm:p-8 md:col-span-5 md:border-b-0 md:border-r">
            <h2 className="mb-1 text-xl font-bold text-ink">Book an Appointment</h2>
            <p className="mb-6 text-xs text-muted">{isManager ? "Book a consultation on behalf of a student or enquiry." : "Choose a date and time to talk to an advisor about a course."}</p>
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
                <SlotGroup title="Morning Sessions" slots={MORNING_SLOTS} booked={bookedTimes} passed={slotPassed} selected={selectedTime} onPick={setSelectedTime} />
                <SlotGroup title="Evening Sessions" slots={EVENING_SLOTS} booked={bookedTimes} passed={slotPassed} selected={selectedTime} onPick={setSelectedTime} />
                {message && <p className="rounded-xl bg-active px-3 py-2 text-xs text-primary">{message}</p>}

                {selectedTime ? (
                  <form onSubmit={submit} className="space-y-4 border-t border-border-subtle pt-6">
                    <h4 className="text-sm font-bold text-primary">Student details for {selectedTime}</h4>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className={LABEL}>
                        Student Full Name
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
                    <div className="flex justify-end">
                      <button type="submit" disabled={!canSubmit} className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white disabled:opacity-60">
                        {submitting ? "Booking…" : "Confirm & Book Consultation"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="flex items-center gap-2 rounded-xl border border-border-subtle bg-page p-4 text-xs text-muted">
                    <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    Select an available time slot to enter the student details.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {tab === "list" && (
        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-bold text-ink">{isManager ? "Scheduled Consultations" : "My Consultations"}</h2>
            <p className="text-xs text-muted">{isManager ? "Every booked or cancelled consultation. Search by student, email or course." : "The consultations you have booked."}</p>
          </div>
          {loading ? (
            <SkeletonList count={6} />
          ) : (
            <DataTable
              title="appointments"
              name="appointments"
              columns={columns}
              rows={appointments}
              initialSort={{ key: "dateTime", dir: "desc" }}
              pageSize={10}
              emptyLabel="No appointments yet."
              rowActions={(row) =>
                row.status !== "cancelled" && (
                  <button type="button" onClick={() => cancel(row)} className="rounded-lg border border-border-subtle px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-page">
                    Cancel
                  </button>
                )
              }
            />
          )}
        </section>
      )}
    </div>
  );
}
