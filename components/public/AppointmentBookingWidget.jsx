"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EVENING_SLOTS, MORNING_SLOTS, slotMinutes } from "../../lib/appointments-shared";
import { bookPublicAppointment, loadPublicBookableCourses, loadPublicBookedSlots } from "../../lib/services/public-appointment-service";

const pad = (value) => String(value).padStart(2, "0");
const toDateStr = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;
function localToday() {
  const now = new Date();
  return toDateStr(now.getFullYear(), now.getMonth(), now.getDate());
}
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const RED = "#E53935";
const FIELD = "w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs text-[#111827] outline-none transition focus:border-[#E53935] focus:ring-2 focus:ring-[#E53935]/20";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const blankForm = { name: "", email: "", phone: "", courseId: "" };
const EASE = [0.22, 1, 0.36, 1];

// The actual calendar + slots + form — writes into the exact same
// `appointments` collection the in-app Appointments scheduler and its
// Director/Admin view already use (see app/api/public/appointments), so a
// visitor's booking shows up for staff with no extra work. No outer
// card chrome here — the modal panel around it supplies that.
function BookingCard({ onBooked }) {
  const today = localToday();
  const [viewMonth, setViewMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [bookedTimes, setBookedTimes] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState("");
  const [courses, setCourses] = useState([]);
  const [form, setForm] = useState(blankForm);
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    loadPublicBookableCourses().then((data) => setCourses(data.courses || [])).catch(() => {});
  }, []);

  function selectDate(date) {
    setSelectedDate(date);
    setSelectedTime("");
    setBookedTimes([]);
    setStatus("idle");
    setFeedback("");
    setSlotsLoading(true);
    loadPublicBookedSlots(date)
      .then((data) => setBookedTimes(data.booked || []))
      .catch(() => {})
      .finally(() => setSlotsLoading(false));
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedDate || !selectedTime || status === "submitting") return;
    if (!form.name.trim() || !EMAIL_PATTERN.test(form.email.trim()) || !form.phone.trim() || !form.courseId) {
      setStatus("error");
      setFeedback("Please fill in every field with a valid email.");
      return;
    }
    setStatus("submitting");
    setFeedback("");
    try {
      await bookPublicAppointment({ ...form, date: selectedDate, time: selectedTime });
      setStatus("success");
      setFeedback("Appointment booked! We'll be in touch to confirm.");
      setForm(blankForm);
      setSelectedDate(null);
      setSelectedTime("");
      onBooked?.();
    } catch (error) {
      setStatus("error");
      setFeedback(error.message || "Unable to book this slot. Please try another.");
      loadPublicBookedSlots(selectedDate).then((data) => setBookedTimes(data.booked || [])).catch(() => {});
    }
  }

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const leadingBlanks = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const atCurrentMonth = year === todayYear && month === todayMonth - 1;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const slotPassed = (slot) => selectedDate === today && slotMinutes(slot) <= nowMinutes;

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[#111827]">{viewMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous month"
            disabled={atCurrentMonth}
            onClick={() => setViewMonth(new Date(year, month - 1, 1))}
            className="grid h-6 w-6 place-items-center rounded-md border border-[#E5E7EB] text-[#6B7280] hover:bg-[#FAFAF7] disabled:opacity-30"
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setViewMonth(new Date(year, month + 1, 1))}
            className="grid h-6 w-6 place-items-center rounded-md border border-[#E5E7EB] text-[#6B7280] hover:bg-[#FAFAF7]"
          >
            →
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((day) => <span key={day} className="text-[9px] font-semibold text-[#9CA3AF]">{day}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 text-center">
        {Array.from({ length: leadingBlanks }, (_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const value = toDateStr(year, month, day);
          const past = value < today;
          const selected = value === selectedDate;
          return (
            <button
              key={value}
              type="button"
              disabled={past}
              onClick={() => selectDate(value)}
              className="mx-auto grid h-7 w-7 place-items-center rounded-lg text-[11px] font-medium transition"
              style={selected ? { background: "#111827", color: "#fff" } : past ? { color: "#D1D5DB", cursor: "not-allowed" } : { color: "#374151" }}
            >
              {day}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <div className="mt-4 border-t border-[#F3F4F6] pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#111827]">
              {(() => {
                const [y, m, d] = selectedDate.split("-").map(Number);
                return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
              })()}
            </span>
            {slotsLoading && <span className="text-[10px] text-[#9CA3AF]">Checking…</span>}
          </div>

          {[["Morning", MORNING_SLOTS], ["Evening", EVENING_SLOTS]].map(([label, slots]) => (
            <div key={label} className="mt-2">
              <p className="text-[9px] font-bold uppercase tracking-wider text-[#9CA3AF]">{label}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {slots.map((slot) => {
                  const unavailable = bookedTimes.includes(slot) || slotPassed(slot);
                  const selected = selectedTime === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={unavailable}
                      onClick={() => setSelectedTime(slot)}
                      className="rounded-full border px-2.5 py-1 text-[10px] font-semibold transition"
                      style={
                        selected
                          ? { background: RED, borderColor: RED, color: "#fff" }
                          : unavailable
                            ? { borderColor: "#E5E7EB", color: "#D1D5DB", textDecoration: "line-through", cursor: "not-allowed" }
                            : { borderColor: "#E5E7EB", color: "#374151" }
                      }
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {selectedTime && (
            <form onSubmit={submit} className="mt-3 space-y-2 border-t border-[#F3F4F6] pt-3">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your full name" className={FIELD} />
              <div className="grid grid-cols-2 gap-2">
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" placeholder="Email" className={FIELD} />
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} type="tel" placeholder="Phone" className={FIELD} />
              </div>
              <select value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })} className={FIELD}>
                <option value="">{courses.length ? "Training you're interested in…" : "No trainings open right now"}</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
              </select>
              {feedback && (
                <p className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium ${status === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-[#B91C1C]"}`}>{feedback}</p>
              )}
              <button
                type="submit"
                disabled={status === "submitting"}
                className="w-full rounded-lg py-2 text-xs font-bold text-white transition disabled:opacity-60"
                style={{ background: RED }}
              >
                {status === "submitting" ? "Booking…" : "Confirm Appointment"}
              </button>
            </form>
          )}
        </div>
      )}

      <p className="mt-3 border-t border-[#F3F4F6] pt-2 text-[10px] text-[#9CA3AF]">
        Times are shown in the academy&apos;s local time.
      </p>
    </div>
  );
}

// Public entry point — a compact CTA button that opens the booking card in
// a Framer-Motion modal, instead of the card sitting inline (which pushed
// the rest of the Contact section down). Closes on the X, backdrop click,
// Escape, or automatically a moment after a successful booking.
export default function AppointmentBookingWidget() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function handleBooked() {
    setTimeout(() => setOpen(false), 1800);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-bold transition hover:shadow-md"
        style={{ borderColor: RED, color: RED, background: "#FFF5F5" }}
      >
        <span aria-hidden="true">📅</span> Book an Appointment
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Book an appointment"
              className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.25, ease: EASE }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-[#111827]">Book an Appointment</p>
                  <p className="mt-0.5 text-[11px] text-[#6B7280]">Talk to us before you enroll — pick a free slot.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[#9CA3AF] transition hover:bg-[#F3F4F6] hover:text-[#111827]"
                >
                  ✕
                </button>
              </div>
              <div className="mt-3">
                <BookingCard onBooked={handleBooked} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
