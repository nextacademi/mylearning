"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudOff,
  DoorOpen,
  GraduationCap,
  MapPin,
  Plus,
  Users,
  User,
  Wifi,
  X,
} from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import {
  activeRooms as filterActiveRooms,
  BAR_COLORS,
  bookingEndDate,
  bookingSlot,
  cancelRoomBooking,
  createRoom,
  createRoomBooking,
  datesOverlap,
  deleteRoom,
  findConflict,
  setRoomStatus,
  SLOT_KEYS,
  SLOT_STATUS_DEFAULT,
  SLOT_TIMES,
  subscribeClasses,
  subscribeCourses,
  subscribeRoomBookings,
  subscribeRooms,
  subscribeTeachers,
  updateRoom,
  updateRoomBooking,
  ymd,
} from "../../lib/room-booking-data";

const MANAGER_ROLES = new Set(["Admin", "Director"]);
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const ROOM_TYPES = [
  "Classroom",
  "Computer Lab",
  "Science Lab",
  "Meeting Room",
  "Auditorium",
  "Studio",
  "Workshop",
  "Seminar Room",
];

const PALETTE = [
  { chip: "bg-info-soft text-info", dot: "bg-info" },
  { chip: "bg-success-soft text-success", dot: "bg-success" },
  { chip: "bg-warning-soft text-warning", dot: "bg-warning" },
  { chip: "bg-purple-soft text-purple", dot: "bg-purple" },
  { chip: "bg-teal-soft text-teal", dot: "bg-teal" },
  { chip: "bg-active text-primary", dot: "bg-primary" },
];

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1)
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

const roomStyle = (roomId) =>
  PALETTE[hashString(roomId || "") % PALETTE.length];

function to12h(value) {
  if (!/^\d{2}:\d{2}$/.test(value || "")) return value || "";
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${period}`;
}

const timeRange = (booking) =>
  `${to12h(booking.startTime)} – ${to12h(booking.endTime)}`;

function prettyDate(
  iso,
  opts = { weekday: "short", month: "short", day: "numeric" },
) {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-US", opts);
}

function useOnlineStatus() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

function Modal({ title, children, onClose, wide }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-card p-5 shadow-2xl sm:p-6 ${wide ? "max-w-2xl" : "max-w-lg"}`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-page"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const LABEL = "grid gap-1 text-xs font-bold text-muted";
const FIELD =
  "rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary";

const BLANK_ROOM = {
  name: "",
  code: "",
  capacity: "",
  building: "",
  floor: "",
  roomType: "",
  facilities: "",
  status: "active",
};

function RoomForm({ initial, editingId, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ ...BLANK_ROOM, ...initial }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      if (editingId) await updateRoom(editingId, form);
      else await createRoom(form);
      onSaved(
        editingId ? "Room updated." : `${form.name.trim() || "Room"} added.`,
      );
    } catch (submitError) {
      setError(submitError?.message || "Could not save this room.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Room name
          <input
            value={form.name}
            onChange={set("name")}
            required
            maxLength={120}
            placeholder="Room A"
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Room number / code
          <input
            value={form.code}
            onChange={set("code")}
            maxLength={60}
            placeholder="A-201"
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Capacity
          <input
            type="number"
            min="0"
            value={form.capacity}
            onChange={set("capacity")}
            placeholder="40"
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Room type
          <input
            list="rb-room-types"
            value={form.roomType}
            onChange={set("roomType")}
            maxLength={80}
            placeholder="Classroom"
            className={FIELD}
          />
          <datalist id="rb-room-types">
            {ROOM_TYPES.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
        </label>
        <label className={LABEL}>
          Building / location
          <input
            value={form.building}
            onChange={set("building")}
            maxLength={160}
            placeholder="Main Campus"
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Floor
          <input
            value={form.floor}
            onChange={set("floor")}
            maxLength={60}
            placeholder="2"
            className={FIELD}
          />
        </label>
      </div>
      <label className={LABEL}>
        Facilities{" "}
        <span className="font-normal text-subtle">(comma separated)</span>
        <input
          value={form.facilities}
          onChange={set("facilities")}
          placeholder="Projector, AC, Whiteboard"
          className={FIELD}
        />
      </label>
      <label className={LABEL}>
        Status
        <select value={form.status} onChange={set("status")} className={FIELD}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>
      {error && (
        <p className="rounded-xl bg-active px-3 py-2 text-sm text-primary">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted"
        >
          Cancel
        </button>
        <button
          disabled={saving}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : editingId ? "Save changes" : "Add room"}
        </button>
      </div>
    </form>
  );
}

function RoomsManager({ rooms, bookings, onNotice }) {
  const [formState, setFormState] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [error, setError] = useState("");

  const upcomingByRoom = useMemo(() => {
    const today = ymd(new Date());
    const map = new Map();
    bookings.forEach((booking) => {
      if (booking.status === "cancelled" || booking.date < today) return;
      map.set(booking.roomId, (map.get(booking.roomId) || 0) + 1);
    });
    return map;
  }, [bookings]);

  async function toggle(room) {
    setError("");
    try {
      await setRoomStatus(
        room.id,
        room.status === "active" ? "inactive" : "active",
      );
      onNotice(
        room.status === "active"
          ? `${room.name} deactivated.`
          : `${room.name} reactivated.`,
      );
    } catch (toggleError) {
      setError(toggleError?.message || "Could not update this room.");
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    setError("");
    try {
      await deleteRoom(confirmDelete.id);
      onNotice(`${confirmDelete.name} deleted.`);
      setConfirmDelete(null);
    } catch (deleteError) {
      setError(deleteError?.message || "Could not delete this room.");
      setConfirmDelete(null);
    }
  }

  return (
    <section className="space-y-4 rounded-3xl border border-border-subtle bg-card p-4 shadow-sm md:p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-ink">Rooms</h3>
          <p className="text-xs text-muted">
            {rooms.length} room{rooms.length === 1 ? "" : "s"} ·{" "}
            {filterActiveRooms(rooms).length} active.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormState({ initial: BLANK_ROOM, editingId: null })}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white"
        >
          <Plus className="h-4 w-4" /> Add Room
        </button>
      </div>
      {error && (
        <p className="rounded-xl bg-active p-3 text-sm text-primary">{error}</p>
      )}
      {!rooms.length ? (
        <p className="rounded-2xl border border-dashed border-border-subtle py-12 text-center text-sm text-muted">
          No rooms yet. Add your first classroom to start booking.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border-subtle">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border-subtle bg-page text-[10px] uppercase tracking-wider text-subtle">
              <tr>
                {[
                  "Room",
                  "Code",
                  "Capacity",
                  "Building",
                  "Floor",
                  "Type",
                  "Facilities",
                  "Status",
                  "Actions",
                ].map((head) => (
                  <th key={head} className="p-3">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr
                  key={room.id}
                  className="border-b border-border-subtle last:border-0 align-top"
                >
                  <td className="p-3">
                    <span className="flex items-center gap-2 font-semibold text-ink">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${roomStyle(room.id).dot}`}
                      />{" "}
                      {room.name}
                    </span>
                  </td>
                  <td className="p-3 text-muted">{room.code || "—"}</td>
                  <td className="p-3 text-muted">{room.capacity ?? "—"}</td>
                  <td className="p-3 text-muted">{room.building || "—"}</td>
                  <td className="p-3 text-muted">{room.floor || "—"}</td>
                  <td className="p-3 text-muted">{room.roomType || "—"}</td>
                  <td className="p-3">
                    {room.facilities?.length ? (
                      <span className="flex flex-wrap gap-1">
                        {(Array.isArray(room.facilities)
                          ? room.facilities
                          : String(room.facilities).split(",")
                        ).map((facility) => (
                          <span
                            key={facility}
                            className="rounded-full bg-page px-2 py-0.5 text-[10px] font-semibold text-muted"
                          >
                            {facility}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${room.status === "active" ? "bg-success-soft text-success" : "bg-page text-muted"}`}
                    >
                      {room.status === "active" ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap p-3 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() =>
                        setFormState({
                          initial: {
                            ...room,
                            capacity: room.capacity ?? "",
                            facilities: Array.isArray(room.facilities)
                              ? room.facilities.join(", ")
                              : room.facilities || "",
                          },
                          editingId: room.id,
                        })
                      }
                      className="text-muted hover:text-primary"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => toggle(room)}
                      className="ml-3 text-info hover:underline"
                    >
                      {room.status === "active" ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        upcomingByRoom.get(room.id)
                          ? setError(
                              `${room.name} has ${upcomingByRoom.get(room.id)} upcoming booking(s). Deactivate it instead of deleting.`,
                            )
                          : setConfirmDelete(room)
                      }
                      className="ml-3 text-primary hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {formState && (
        <Modal
          title={formState.editingId ? "Edit room" : "Add a room"}
          onClose={() => setFormState(null)}
          wide
        >
          <RoomForm
            initial={formState.initial}
            editingId={formState.editingId}
            onClose={() => setFormState(null)}
            onSaved={(message) => {
              setFormState(null);
              onNotice(message);
            }}
          />
        </Modal>
      )}
      {confirmDelete && (
        <Modal title="Delete room" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm text-muted">
            Delete <b>{confirmDelete.name}</b>?
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

const BLANK_BOOKING = {
  roomId: "",
  courseId: "",
  classId: "",
  teacherId: "",
  date: "",
  endDate: "",
  startTime: "",
  endTime: "",
  barColor: BAR_COLORS[0].value,
  slotStatus: "",
  notes: "",
};

function BookingForm({
  initial,
  editingId,
  rooms,
  courses,
  classes,
  teachers,
  allBookings,
  onClose,
  onSaved,
}) {
  const [form, setForm] = useState(() => ({ ...BLANK_BOOKING, ...initial }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { profile, user } = useAuth();

  const roomOptions = useMemo(() => {
    const active = filterActiveRooms(rooms);
    if (form.roomId && !active.some((room) => room.id === form.roomId)) {
      const current = rooms.find((room) => room.id === form.roomId);
      if (current)
        return [...active, current].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
    }
    return active;
  }, [rooms, form.roomId]);

  const set = (key) => (event) => {
    const value = event.target.value;
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "courseId" && current.classId) {
        const stillValid = classes.some(
          (batch) => batch.id === current.classId && batch.courseId === value,
        );
        if (!stillValid) next.classId = "";
      }
      if (key === "classId" && value) {
        const batch = classes.find((entry) => entry.id === value);
        const suggested =
          batch?.teacherIds?.[0] ||
          courses.find((course) => course.id === next.courseId)
            ?.primaryTeacherId ||
          "";
        if (suggested && !next.teacherId) next.teacherId = suggested;
      }
      return next;
    });
  };

  // Slot is a convenience quick-fill (Morning/Afternoon/Evening →
  // SLOT_TIMES), not a stored field of its own — the real stored fields
  // stay startTime/endTime (still freely editable after picking a slot),
  // matching how normalizeBooking derives `slot` from startTime anyway.
  function selectSlot(slotKey) {
    const times = SLOT_TIMES[slotKey] || SLOT_TIMES.Morning;
    setForm((current) => ({
      ...current,
      startTime: times.startTime,
      endTime: times.endTime,
      slotStatus: current.slotStatus || SLOT_STATUS_DEFAULT[slotKey],
    }));
  }

  const courseClasses = useMemo(
    () => classes.filter((batch) => batch.courseId === form.courseId),
    [classes, form.courseId],
  );

  const liveConflict = useMemo(() => {
    if (
      !form.roomId ||
      !form.date ||
      !/^\d{2}:\d{2}$/.test(form.startTime) ||
      !/^\d{2}:\d{2}$/.test(form.endTime)
    )
      return null;
    if (form.endTime <= form.startTime) return null;
    return findConflict(allBookings, form, editingId);
  }, [allBookings, form, editingId]);

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");

    const room = rooms.find((entry) => entry.id === form.roomId);
    const course = courses.find((entry) => entry.id === form.courseId);
    const batch = classes.find((entry) => entry.id === form.classId);
    const teacher = teachers.find((entry) => entry.id === form.teacherId);

    const payload = {
      ...form,
      roomName: room?.name || "",
      courseTitle: course?.title || "",
      className: batch?.name || "",
      teacherName: teacher?.name || "",
    };

    const meta = {
      createdByName: profile?.displayName || user?.email || "",
      updatedByName: profile?.displayName || user?.email || "",
    };

    try {
      if (editingId) await updateRoomBooking(editingId, payload, meta);
      else await createRoomBooking(payload, meta);
      onSaved(
        editingId
          ? "Booking updated."
          : `${room?.name || "Room"} booked for ${prettyDate(form.date)}.`,
      );
    } catch (submitError) {
      setError(
        submitError?.message ||
          "Could not save this booking. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!roomOptions.length) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl bg-warning-soft px-3 py-3 text-sm font-semibold text-warning">
          There are no active rooms yet. Add a room in the Rooms tab first.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className={LABEL}>
        Room
        <select
          value={form.roomId}
          onChange={set("roomId")}
          required
          className={FIELD}
        >
          <option value="">Select a room</option>
          {roomOptions.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
              {room.code ? ` (${room.code})` : ""}
              {room.status === "inactive" ? " — inactive" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        Course
        <select
          value={form.courseId}
          onChange={set("courseId")}
          required
          className={FIELD}
        >
          <option value="">Select a course</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}
              {course.courseCode ? ` (${course.courseCode})` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        Class / Batch
        <select
          value={form.classId}
          onChange={set("classId")}
          required
          disabled={!form.courseId}
          className={`${FIELD} disabled:bg-page disabled:text-muted`}
        >
          <option value="">
            {form.courseId ? "Select a class" : "Choose a course first"}
          </option>
          {courseClasses.map((batch) => (
            <option key={batch.id} value={batch.id}>
              {batch.name}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        Teacher
        <select
          value={form.teacherId}
          onChange={set("teacherId")}
          required
          className={FIELD}
        >
          <option value="">Select a teacher</option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.name}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL}>
        Time slot{" "}
        <span className="font-normal text-subtle">
          (quick-fill — start/end time below stays editable)
        </span>
        <select
          onChange={(event) =>
            event.target.value && selectSlot(event.target.value)
          }
          defaultValue=""
          className={FIELD}
        >
          <option value="">Choose a slot…</option>
          {SLOT_KEYS.map((key) => (
            <option key={key} value={key}>
              {key} ({to12h(SLOT_TIMES[key].startTime)}–
              {to12h(SLOT_TIMES[key].endTime)})
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={LABEL}>
          Start date
          <input
            type="date"
            value={form.date}
            onChange={set("date")}
            required
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          End date{" "}
          <span className="font-normal text-subtle">
            (optional — for a multi-day booking)
          </span>
          <input
            type="date"
            value={form.endDate}
            min={form.date || undefined}
            onChange={set("endDate")}
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Start time
          <input
            type="time"
            value={form.startTime}
            onChange={set("startTime")}
            required
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          End time
          <input
            type="time"
            value={form.endTime}
            onChange={set("endTime")}
            required
            className={FIELD}
          />
        </label>
        <label className={LABEL}>
          Bar color
          <select
            value={form.barColor}
            onChange={set("barColor")}
            className={FIELD}
          >
            {BAR_COLORS.map((color) => (
              <option key={color.value} value={color.value}>
                {color.label}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Slot status
          <select
            value={form.slotStatus}
            onChange={set("slotStatus")}
            className={FIELD}
          >
            <option value="">Auto (based on time slot)</option>
            <option value="Open">Open</option>
            <option value="Busy">Busy</option>
            <option value="Reserved">Reserved</option>
          </select>
        </label>
      </div>
      <label className={LABEL}>
        Notes <span className="font-normal text-subtle">(optional)</span>
        <textarea
          value={form.notes}
          onChange={set("notes")}
          rows={2}
          maxLength={1000}
          className={FIELD}
        />
      </label>
      {liveConflict && !error && (
        <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
          {rooms.find((room) => room.id === form.roomId)?.name || "That room"}{" "}
          already has “{liveConflict.courseTitle || "a booking"}” from{" "}
          {to12h(liveConflict.startTime)} to {to12h(liveConflict.endTime)} that
          day. Choose another room or time.
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-active px-3 py-2 text-sm text-primary">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted"
        >
          Cancel
        </button>
        <button
          disabled={saving || Boolean(liveConflict)}
          className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : editingId ? "Save changes" : "Book room"}
        </button>
      </div>
    </form>
  );
}

function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-3 border-b border-border-subtle py-2.5 last:border-0">
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0 text-subtle"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">
          {label}
        </p>
        <p className="text-sm font-semibold text-ink">{children || "—"}</p>
      </div>
    </div>
  );
}

function BookingDetail({
  booking,
  roomName,
  canManage,
  onEdit,
  onCancel,
  onClose,
}) {
  const [confirming, setConfirming] = useState(false);
  const style = roomStyle(booking.roomId);
  return (
    <Modal title="Booking details" onClose={onClose}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${style.chip}`}
        >
          <span className={`h-2 w-2 rounded-full ${style.dot}`} /> {roomName}
        </span>
        {booking.status === "cancelled" && (
          <span className="rounded-full bg-page px-2.5 py-1 text-[10px] font-bold uppercase text-muted">
            Cancelled
          </span>
        )}
      </div>
      <div className="rounded-2xl border border-border-subtle p-3">
        <DetailRow icon={GraduationCap} label="Course">
          {booking.courseTitle}
        </DetailRow>
        <DetailRow icon={Users} label="Class / Batch">
          {booking.className}
        </DetailRow>
        <DetailRow icon={User} label="Teacher">
          {booking.teacherName}
        </DetailRow>
        <DetailRow icon={MapPin} label="Room">
          {roomName}
        </DetailRow>
        <DetailRow icon={CalendarDays} label="Date">
          {prettyDate(booking.date, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </DetailRow>
        <DetailRow icon={Clock} label="Time">
          {timeRange(booking)}
        </DetailRow>
        {booking.notes && (
          <DetailRow icon={DoorOpen} label="Notes">
            {booking.notes}
          </DetailRow>
        )}
      </div>
      {canManage && booking.status !== "cancelled" && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
          {confirming ? (
            <>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted"
              >
                Keep it
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white"
              >
                Cancel booking
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-bold text-ink hover:bg-active"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-xl border border-border-subtle px-4 py-2.5 text-sm font-bold text-primary hover:bg-active"
              >
                Cancel booking
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

// ===========================================================================
// CALENDAR GRID (FIXED REAL-TIME DB RENDERING)
// ===========================================================================
const SLOT_ROW_CLASS = {
  Morning: "bg-purple-800 text-white",
  Afternoon: "bg-red-600 text-white",
  Evening: "bg-orange-600 text-white",
};

function CalendarGrid({
  cursor,
  bookings,
  roomFilter,
  resolveRoomName,
  onCellClick,
  rooms = [],
  density = "compact",
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month, daysInMonth);

  const isWeekend = (day) => {
    const dayOfWeek = new Date(year, month, day).getDay();
    return dayOfWeek === 5 || dayOfWeek === 6;
  };

  // Fixed Date Formatter for exact YYYY-MM-DD match with Firestore/DB ISO dates
  const makeDateKey = (day) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const getRoomName = (room) =>
    room?.name || room?.code || room?.roomNumber || "Room";
  const getRoomSize = (room) => room?.capacity || room?.size || "—";

  // Real multi-day bookings (endDate may be later than date, see
  // lib/room-booking-data.js's bookingEndDate) are indexed once per
  // room+slot "row" here, then walked day-by-day below so a booking that
  // spans several days renders as ONE spanning bar (clamped to the visible
  // month) instead of a separate bar repeated on every day.
  const bookingsByRow = useMemo(() => {
    const map = new Map();
    bookings.forEach((booking) => {
      if (!booking.roomId || !booking.date) return;
      const key = `${booking.roomId}|${bookingSlot(booking)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(booking);
    });
    return map;
  }, [bookings]);

  function findBookingCoveringDay(roomId, slot, day) {
    const list = bookingsByRow.get(`${roomId}|${slot}`);
    if (!list) return null;
    const current = new Date(year, month, day);
    return (
      list.find((booking) => {
        const start = new Date(`${booking.date}T00:00:00`);
        const end = new Date(`${bookingEndDate(booking)}T00:00:00`);
        return start <= current && current <= end;
      }) || null
    );
  }

  // Row cells: a plain array of {type, day, span, booking} walked left to
  // right — when a booking is found, jump straight past every day it
  // still covers within this month so it isn't re-rendered per day.
  function buildRowCells(roomId, slot) {
    const cells = [];
    let day = 1;
    while (day <= daysInMonth) {
      const booking = findBookingCoveringDay(roomId, slot, day);
      if (booking) {
        const start = new Date(`${booking.date}T00:00:00`);
        const end = new Date(`${bookingEndDate(booking)}T00:00:00`);
        const visibleEnd = end > monthEnd ? monthEnd : end;
        const span = visibleEnd.getDate() - day + 1;
        cells.push({ type: "booking", day, span: Math.max(1, span), booking });
        day += Math.max(1, span);
      } else {
        cells.push({ type: "empty", day, span: 1 });
        day += 1;
      }
    }
    return cells;
  }

  const roomList = useMemo(() => {
    if (rooms && rooms.length > 0) return rooms;
    return Array.from(
      new Map(
        bookings
          .filter(Boolean)
          .map((booking) => [
            String(booking.roomId),
            {
              id: booking.roomId,
              name: booking.roomName || resolveRoomName?.(booking) || "Room",
              capacity: booking.capacity || "—",
            },
          ]),
      ).values(),
    );
  }, [rooms, bookings, resolveRoomName]);

  const filteredRooms =
    roomFilter === "all"
      ? roomList
      : roomList.filter((room) => String(room.id) === String(roomFilter));

  const compact = density === "compact";
  const rowMinH = compact ? "min-h-[28px]" : "min-h-[36px]";
  const cellText = compact ? "text-[10px]" : "text-xs";
  const barText = compact ? "text-[10px]" : "text-[11px]";

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-border-subtle">
      <div
        className={`min-w-[1500px] bg-card ${cellText}`}
        style={{
          display: "grid",
          gridTemplateColumns: `160px 80px 100px repeat(${daysInMonth}, 1fr)`,
        }}
      >
        {/* HEADERS */}
        <div className="sticky left-0 z-40 flex items-center justify-center border-b border-r border-slate-300 bg-slate-100 p-2 font-bold text-slate-800">
          Room Number
        </div>
        <div className="sticky left-[160px] z-40 flex items-center justify-center border-b border-r border-slate-300 bg-slate-100 p-2 font-bold text-slate-800">
          Size
        </div>
        <div className="sticky left-[240px] z-40 flex items-center justify-center border-b border-r border-slate-300 bg-slate-100 p-2 font-bold text-slate-800">
          Slot
        </div>
        {days.map((day) => (
          <div
            key={day}
            className={`flex ${rowMinH} items-center justify-center border-b border-r border-slate-300 font-bold ${
              isWeekend(day)
                ? "bg-yellow-200 text-slate-900"
                : "bg-slate-50 text-slate-800"
            }`}
          >
            {day}
          </div>
        ))}

        {/* ROWS */}
        {filteredRooms.map((room) => {
          const roomId = room.id;
          return SLOT_KEYS.map((slot, slotIndex) => {
            const rowCells = buildRowCells(roomId, slot);
            return (
              <React.Fragment key={`${roomId}-${slot}`}>
                {slotIndex === 0 && (
                  <div
                    className="sticky left-0 z-30 flex items-center justify-center border-b border-r border-slate-300 bg-card font-black text-red-600"
                    style={{ gridRow: "span 3" }}
                  >
                    {getRoomName(room)}
                  </div>
                )}
                {slotIndex === 0 && (
                  <div
                    className="sticky left-[160px] z-30 flex items-center justify-center border-b border-r border-slate-300 bg-card font-bold text-purple-700"
                    style={{ gridRow: "span 3" }}
                  >
                    {getRoomSize(room)}
                  </div>
                )}
                <div
                  className={`sticky left-[240px] z-30 flex ${rowMinH} items-center justify-center border-b border-r border-slate-300 px-1 font-semibold ${SLOT_ROW_CLASS[slot]}`}
                >
                  {slot}
                </div>
                {rowCells.map((cell) => (
                  <div
                    key={`${roomId}-${slot}-${cell.day}`}
                    style={{ gridColumn: `span ${cell.span}` }}
                    className={`relative ${rowMinH} border-b border-r border-slate-200 p-0.5 ${
                      cell.type === "empty" && isWeekend(cell.day)
                        ? "bg-yellow-50/50"
                        : "bg-card"
                    }`}
                  >
                    {cell.type === "booking" ? (
                      <button
                        type="button"
                        onClick={(event) =>
                          onCellClick?.({
                            date: makeDateKey(cell.day),
                            roomId,
                            slot,
                            booking: cell.booking,
                            x: event.clientX,
                            y: event.clientY,
                          })
                        }
                        style={{
                          backgroundColor: cell.booking.barColor || "#0f2b5c",
                        }}
                        className={`absolute inset-0.5 z-20 flex flex-col items-center justify-center overflow-hidden rounded-full px-1.5 text-center font-bold text-white shadow transition hover:shadow-md hover:brightness-110 ${barText}`}
                        title={`${cell.booking.courseTitle || "Booking"} (${timeRange(cell.booking)})`}
                      >
                        <span className="block w-full truncate">
                          {cell.booking.courseTitle || "Booked"}
                        </span>
                        {cell.booking.slotStatus &&
                          cell.booking.slotStatus !== "Busy" && (
                            <span className="block w-full truncate text-[9px] font-normal opacity-80">
                              {cell.booking.slotStatus}
                            </span>
                          )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="absolute inset-0 h-full w-full hover:bg-slate-100"
                        onClick={(event) =>
                          onCellClick?.({
                            date: makeDateKey(cell.day),
                            roomId,
                            slot,
                            booking: null,
                            x: event.clientX,
                            y: event.clientY,
                          })
                        }
                        aria-label={`Select ${makeDateKey(cell.day)}, ${getRoomName(room)}, ${slot}`}
                      />
                    )}
                  </div>
                ))}
              </React.Fragment>
            );
          });
        })}
      </div>
    </div>
  );
}

function LedgerGrid({
  cursor,
  byRoomDate,
  columns,
  canManage,
  onSelectBooking,
  onBook,
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) =>
    ymd(new Date(year, month, i + 1)),
  );
  const today = ymd(new Date());

  return (
    <div className="overflow-x-auto rounded-xl border border-border-subtle">
      <table
        className="w-full border-collapse text-left text-sm"
        style={{ minWidth: `${180 + columns.length * 150}px` }}
      >
        <thead>
          <tr className="border-b border-border-subtle bg-page text-[10px] uppercase tracking-wider text-subtle">
            <th className="sticky left-0 z-10 bg-page p-3">Date</th>
            {columns.map((room) => (
              <th key={room.id} className="p-3">
                {room.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr
              key={day}
              className={`border-b border-border-subtle last:border-0 ${day === today ? "bg-active/40" : ""}`}
            >
              <td className="sticky left-0 z-10 whitespace-nowrap bg-card p-3 align-top text-xs font-bold text-ink">
                {prettyDate(day, { weekday: "short", day: "numeric" })}
              </td>
              {columns.map((room) => {
                const slot = (byRoomDate.get(`${room.id}|${day}`) || [])
                  .slice()
                  .sort((a, b) => a.startTime.localeCompare(b.startTime));
                return (
                  <td key={room.id} className="p-2 align-top">
                    {slot.length ? (
                      <div className="space-y-1">
                        {slot.map((booking) => (
                          <button
                            key={booking.id}
                            type="button"
                            onClick={() => onSelectBooking(booking)}
                            className={`block w-full rounded-lg px-2 py-1 text-left text-xs font-semibold ${roomStyle(booking.roomId).chip}`}
                          >
                            <span className="block truncate">
                              {booking.courseTitle || "Booking"}
                            </span>
                            <span className="block text-[10px] font-normal opacity-80">
                              {timeRange(booking)}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : canManage && room.status === "active" ? (
                      <button
                        type="button"
                        onClick={() => onBook({ roomId: room.id, date: day })}
                        className="w-full rounded-lg border border-dashed border-border-subtle px-2 py-1.5 text-[11px] font-semibold text-subtle hover:border-primary hover:text-primary"
                      >
                        Available
                      </button>
                    ) : (
                      <span className="block px-2 py-1.5 text-[11px] font-semibold text-subtle">
                        Available
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgendaList({
  monthBookings,
  roomFilter,
  resolveRoomName,
  onSelectBooking,
  emptyLabel,
}) {
  const filtered = monthBookings
    .filter((b) => roomFilter === "all" || b.roomId === roomFilter)
    .slice()
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime),
    );

  if (!filtered.length)
    return (
      <p className="rounded-2xl border border-dashed border-border-subtle bg-card py-12 text-center text-sm text-muted">
        {emptyLabel}
      </p>
    );

  const groups = [];
  filtered.forEach((booking) => {
    const last = groups[groups.length - 1];
    if (last && last.date === booking.date) last.items.push(booking);
    else groups.push({ date: booking.date, items: [booking] });
  });

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.date}>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-subtle">
            {prettyDate(group.date, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <div className="space-y-2">
            {group.items.map((booking) => {
              const name = resolveRoomName(booking);
              return (
                <button
                  key={booking.id}
                  type="button"
                  onClick={() => onSelectBooking(booking)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-border-subtle bg-card p-3 text-left shadow-sm hover:border-primary"
                >
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[10px] font-black ${roomStyle(booking.roomId).chip}`}
                  >
                    {name.replace(/^Room\s+/i, "").slice(0, 4) || "RM"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm text-ink">
                      {booking.courseTitle || "Booking"}
                    </b>
                    <span className="block truncate text-xs text-muted">
                      {name} · {timeRange(booking)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// Anchored popup that opens right next to whichever Calendar Matrix cell was
// clicked, instead of a separate "day panel" rendered below the whole grid.
// Positioned with fixed coordinates from the click event, then nudged back
// on-screen (via a ref + layout effect, since its height isn't known until
// it renders — a plain booking summary is a different height than the
// "+ Add booking" empty state). Closes on the X button, an outside
// pointerdown, or Escape — all three wired here so every call site gets
// them for free.
function CellPopover({ cell, room, canManage, onSelectBooking, onBook, onClose }) {
  const ref = useRef(null);
  const [style, setStyle] = useState({ top: cell.y, left: cell.x, visibility: "hidden" });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const { innerWidth, innerHeight } = window;
    const rect = node.getBoundingClientRect();
    const margin = 12;
    let left = cell.x + margin;
    let top = cell.y + margin;
    if (left + rect.width + margin > innerWidth) left = cell.x - rect.width - margin;
    if (left < margin) left = Math.min(margin, innerWidth - rect.width - margin);
    if (top + rect.height + margin > innerHeight) top = cell.y - rect.height - margin;
    if (top < margin) top = Math.min(margin, innerHeight - rect.height - margin);
    setStyle({ top: Math.max(margin, top), left: Math.max(margin, left), visibility: "visible" });
  }, [cell.x, cell.y]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top: style.top, left: style.left, visibility: style.visibility }}
      className="z-50 w-72 rounded-2xl border border-border-subtle bg-card p-4 shadow-2xl"
      role="dialog"
      aria-modal="true"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink">
            {prettyDate(cell.date, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
          <p className="mt-0.5 truncate text-xs font-semibold text-muted">
            {room?.name || "Room"}
            {cell.slot && (
              <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${SLOT_ROW_CLASS[cell.slot]}`}>
                {cell.slot}
              </span>
            )}
          </p>
        </div>
        <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1 text-muted hover:bg-page" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      {cell.booking ? (
        <button
          type="button"
          onClick={() => onSelectBooking(cell.booking)}
          className="block w-full rounded-xl border border-border-subtle bg-page p-3 text-left"
        >
          <b className="block truncate text-sm text-ink">{cell.booking.courseTitle || "Booking"}</b>
          <span className="mt-1 block text-xs text-muted">{timeRange(cell.booking)}</span>
          {cell.booking.teacherName && (
            <span className="mt-0.5 block truncate text-xs text-muted">{cell.booking.teacherName}</span>
          )}
          <span className="mt-2 block text-[11px] font-bold text-primary">View details →</span>
        </button>
      ) : (
        <p className="rounded-xl bg-page p-3 text-xs text-muted">No booking yet for this slot.</p>
      )}

      {canManage && (
        <button
          type="button"
          onClick={() => onBook({ roomId: cell.roomId, date: cell.date, slot: cell.slot })}
          className="mt-3 w-full rounded-xl border border-dashed border-border-subtle p-2.5 text-xs font-semibold text-success hover:border-primary"
        >
          + Add booking
        </button>
      )}
    </div>
  );
}

// ===========================================================================
// MAIN PAGE COMPONENT
// ===========================================================================
export default function RoomBooking({ role }) {
  const canManage = MANAGER_ROLES.has(role);
  const online = useOnlineStatus();
  const { profile, user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [bookings, setBookings] = useState([]);
  const [meta, setMeta] = useState({ fromCache: false, pendingWrites: false });
  const [loaded, setLoaded] = useState(false);
  const [courses, setCourses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("calendar");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [roomFilter, setRoomFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [density, setDensity] = useState("compact");
  const [view, setView] = useState("calendar");
  const [cellPopup, setCellPopup] = useState(null);
  const [detail, setDetail] = useState(null);
  const [formState, setFormState] = useState(null);
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef(null);

  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return undefined;
    return subscribeRooms(
      (rows) => {
        setRooms(rows);
        setRoomsLoaded(true);
      },
      () => {
        setLoadError("Unable to load rooms.");
        setRoomsLoaded(true);
      },
    );
  }, [uid]);

  useEffect(() => {
    if (!uid) return undefined;
    return subscribeRoomBookings(
      (rows, m) => {
        setBookings(rows);
        setMeta(m);
        setLoaded(true);
      },
      () => {
        setLoadError("Unable to load room bookings.");
        setLoaded(true);
      },
    );
  }, [uid]);

  useEffect(() => {
    if (!uid || !canManage) return undefined;
    const unsubs = [
      subscribeCourses(setCourses),
      subscribeClasses(setClasses),
      subscribeTeachers(setTeachers),
    ];
    return () => unsubs.forEach((fn) => fn && fn());
  }, [uid, canManage]);

  useEffect(() => {
    if (!notice) return undefined;
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(noticeTimer.current);
  }, [notice]);

  const roomById = useMemo(
    () => new Map(rooms.map((room) => [room.id, room])),
    [rooms],
  );

  const resolveRoomName = useMemo(
    () => (booking) =>
      roomById.get(booking.roomId)?.name || booking.roomName || "Room",
    [roomById],
  );

  const activeRoomList = useMemo(() => filterActiveRooms(rooms), [rooms]);

  const visible = useMemo(
    () => bookings.filter((b) => b.status !== "cancelled"),
    [bookings],
  );

  // Course-title search — real client-side filtering over the same live
  // booking list every view already renders from (no API/schema change).
  const searchFiltered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return visible;
    return visible.filter((b) => (b.courseTitle || "").toLowerCase().includes(term));
  }, [visible, searchTerm]);

  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;

  const monthBookings = useMemo(
    () => searchFiltered.filter((b) => (b.date || "").startsWith(monthKey)),
    [searchFiltered, monthKey],
  );

  // Bookings that OVERLAP the visible month — not just ones starting in
  // it — so a multi-day booking that began last month and is still
  // ongoing still renders (clamped to the month) in the Calendar Matrix.
  const daysInCursorMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const monthRangeStart = `${monthKey}-01`;
  const monthRangeEnd = `${monthKey}-${String(daysInCursorMonth).padStart(2, "0")}`;
  const monthOverlapBookings = useMemo(
    () => searchFiltered.filter((b) => b.date && datesOverlap(b.date, bookingEndDate(b), monthRangeStart, monthRangeEnd)),
    [searchFiltered, monthRangeStart, monthRangeEnd],
  );

  const byRoomDate = useMemo(() => {
    const map = new Map();
    searchFiltered.forEach((b) => {
      if (!b.date || !b.roomId) return;
      const key = `${b.roomId}|${b.date}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(b);
    });
    return map;
  }, [searchFiltered]);

  const columns = useMemo(() => {
    let list = [...activeRoomList];
    if (roomFilter !== "all")
      list = list.filter((room) => room.id === roomFilter);
    return list;
  }, [activeRoomList, roomFilter]);

  const stats = useMemo(() => {
    const roomCount = activeRoomList.length;
    const slotCount = roomCount * 3;
    const totalSlotDays = slotCount * daysInCursorMonth;
    const occupancy = totalSlotDays ? ((monthBookings.length / totalSlotDays) * 100).toFixed(1) : "0.0";
    return { roomCount, slotCount, bookingCount: monthBookings.length, occupancy };
  }, [activeRoomList, monthBookings, daysInCursorMonth]);

  function exportCsv() {
    const header = "Room,Slot,Course,Class,Teacher,Date,End Date,Start Time,End Time,Status\n";
    const rows = monthBookings
      .map((b) => {
        const room = roomById.get(b.roomId)?.name || b.roomName || "Room";
        const cells = [room, bookingSlot(b), b.courseTitle, b.className, b.teacherName, b.date, bookingEndDate(b), b.startTime, b.endTime, b.slotStatus || ""];
        return cells.map((cell) => `"${String(cell || "").replace(/"/g, '""')}"`).join(",");
      })
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `room-bookings-${monthKey}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function shiftMonth(delta) {
    setCursor(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );
    setCellPopup(null);
  }

  function goToday() {
    const d = new Date();
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  // The popup's "+ Add booking" reuses the exact same creation flow as the
  // top "Book Room" button (openCreate -> the Modal + BookingForm already
  // wired below) — just pre-filled with whichever room/date/slot was
  // clicked, instead of a separate booking form living inside the popup.
  function bookFromPopup({ roomId, date, slot }) {
    setCellPopup(null);
    const times = slot ? SLOT_TIMES[slot] : null;
    openCreate({
      roomId,
      date,
      ...(times ? { startTime: times.startTime, endTime: times.endTime } : {}),
      ...(slot ? { slotStatus: SLOT_STATUS_DEFAULT[slot] || "" } : {}),
    });
  }

  function openCreate(prefill = {}) {
    setDetail(null);
    setFormState({
      initial: { ...BLANK_BOOKING, ...prefill },
      editingId: null,
    });
  }

  function openEdit(booking) {
    setDetail(null);
    setFormState({
      initial: {
        roomId: booking.roomId,
        courseId: booking.courseId,
        classId: booking.classId,
        teacherId: booking.teacherId,
        date: booking.date,
        endDate: booking.endDate && booking.endDate !== booking.date ? booking.endDate : "",
        startTime: booking.startTime,
        endTime: booking.endTime,
        barColor: booking.barColor || BAR_COLORS[0].value,
        slotStatus: booking.slotStatus || "",
        notes: booking.notes || "",
      },
      editingId: booking.id,
    });
  }

  async function handleCancel() {
    if (!detail) return;
    try {
      await cancelRoomBooking(detail.id, {
        cancelledByName: profile?.displayName || user?.email || "",
      });
      setNotice("Booking cancelled.");
      setDetail(null);
    } catch (error) {
      setNotice(error?.message || "Could not cancel booking.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-3xl border border-[#f3aaaa] bg-card p-6 text-ink shadow-xl md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black">
            <DoorOpen className="h-7 w-7 text-primary" /> Room Booking
          </h2>
          <p className="mt-1 text-sm text-muted">Real-Time Schedule Matrix</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full border border-border-subtle bg-card px-3 py-1.5 text-[11px] font-bold">
            {online ? (
              <span className="text-success flex items-center gap-1">
                <Wifi className="h-3.5 w-3.5" /> Live Sync
              </span>
            ) : (
              <span className="text-warning flex items-center gap-1">
                <CloudOff className="h-3.5 w-3.5" /> Offline
              </span>
            )}
          </span>
          {canManage && (
            <button
              type="button"
              onClick={() => openCreate({})}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white"
            >
              <Plus className="h-4 w-4" /> Book Room
            </button>
          )}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-4">
        {[
          { label: "Active Rooms", value: stats.roomCount, icon: DoorOpen, tone: "bg-info-soft text-info" },
          { label: "Time Slots", value: stats.slotCount, icon: Clock, tone: "bg-warning-soft text-warning" },
          { label: "Bookings This Month", value: stats.bookingCount, icon: GraduationCap, tone: "bg-success-soft text-success" },
          { label: "Occupancy", value: `${stats.occupancy}%`, icon: CalendarDays, tone: "bg-active text-primary" },
        ].map((card) => (
          <div key={card.label} className="flex items-center justify-between rounded-xl border border-border-subtle bg-card p-3 shadow-sm">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">{card.label}</p>
              <p className="text-lg font-black text-ink sm:text-xl">{card.value}</p>
            </div>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${card.tone}`}>
              <card.icon className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-subtle bg-card p-2.5 text-xs shadow-sm">
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">Slots:</span>
          <span className="flex items-center gap-1 font-semibold"><span className="h-2.5 w-2.5 rounded-sm bg-purple-800" />Morning</span>
          <span className="flex items-center gap-1 font-semibold"><span className="h-2.5 w-2.5 rounded-sm bg-red-600" />Afternoon</span>
          <span className="flex items-center gap-1 font-semibold"><span className="h-2.5 w-2.5 rounded-sm bg-orange-600" />Evening</span>
          <span className="flex items-center gap-1 border-l border-border-subtle pl-2 text-muted"><span className="h-2.5 w-2.5 rounded-sm border border-yellow-300 bg-yellow-200" />Weekend</span>
        </div>
        <p className="italic text-muted">Tap or click any cell to schedule</p>
      </div>

      {canManage && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("calendar")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold ${
              tab === "calendar"
                ? "bg-primary text-white"
                : "bg-page text-muted"
            }`}
          >
            <CalendarDays className="h-3.5 w-3.5" /> Calendar Matrix
          </button>
          <button
            type="button"
            onClick={() => setTab("rooms")}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold ${
              tab === "rooms" ? "bg-primary text-white" : "bg-page text-muted"
            }`}
          >
            <Building2 className="h-3.5 w-3.5" /> Manage Rooms
          </button>
        </div>
      )}

      {notice && (
        <p className="rounded-xl bg-success-soft p-4 text-sm text-success">
          {notice}
        </p>
      )}
      {loadError && (
        <p className="rounded-xl bg-active p-4 text-sm text-primary">
          {loadError}
        </p>
      )}

      {tab === "rooms" && canManage ? (
        <RoomsManager rooms={rooms} bookings={bookings} onNotice={setNotice} />
      ) : (
        <section className="space-y-4 rounded-3xl border border-border-subtle bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="rounded-lg border p-2"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={goToday}
                className="rounded-lg border px-3 py-2 text-xs font-bold"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="rounded-lg border p-2"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <p className="ml-1 text-base font-bold">
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search course..."
                className="w-32 rounded-lg border border-border-subtle bg-page px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary sm:w-40"
              />
              <select
                value={roomFilter}
                onChange={(event) => setRoomFilter(event.target.value)}
                className="rounded-lg border border-border-subtle bg-page px-2 py-2 text-xs font-bold text-ink outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">All rooms</option>
                {activeRoomList.map((room) => (
                  <option key={room.id} value={room.id}>{room.name}</option>
                ))}
              </select>
              {view === "calendar" && (
                <div className="hidden items-center rounded-lg border border-border-subtle bg-page p-0.5 text-xs sm:flex">
                  <button
                    type="button"
                    onClick={() => setDensity("compact")}
                    className={`rounded px-2 py-1 font-semibold ${density === "compact" ? "bg-card text-ink shadow-sm" : "text-muted"}`}
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDensity("normal")}
                    className={`rounded px-2 py-1 font-semibold ${density === "normal" ? "bg-card text-ink shadow-sm" : "text-muted"}`}
                  >
                    Standard
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={exportCsv}
                className="rounded-lg bg-success px-2.5 py-2 text-xs font-bold text-white"
              >
                Export CSV
              </button>
              <div className="flex gap-2">
                {["calendar", "ledger", "agenda"].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold capitalize ${
                      view === v ? "bg-primary text-white" : "bg-page text-muted"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!loaded ? (
            <p className="py-12 text-center text-sm text-muted">
              Syncing Database...
            </p>
          ) : (
            <>
              {view === "calendar" && (
                <CalendarGrid
                  cursor={cursor}
                  bookings={monthOverlapBookings}
                  roomFilter={roomFilter}
                  resolveRoomName={resolveRoomName}
                  onCellClick={setCellPopup}
                  rooms={activeRoomList}
                  density={density}
                />
              )}
              {view === "ledger" && (
                <LedgerGrid
                  cursor={cursor}
                  byRoomDate={byRoomDate}
                  columns={columns}
                  canManage={canManage}
                  onSelectBooking={setDetail}
                  onBook={openCreate}
                />
              )}
              {view === "agenda" && (
                <AgendaList
                  monthBookings={monthBookings}
                  roomFilter={roomFilter}
                  resolveRoomName={resolveRoomName}
                  onSelectBooking={setDetail}
                  emptyLabel={`No bookings in ${MONTHS[cursor.getMonth()]}.`}
                />
              )}
            </>
          )}
        </section>
      )}

      {cellPopup && (
        <CellPopover
          cell={cellPopup}
          room={roomById.get(cellPopup.roomId)}
          canManage={canManage}
          onSelectBooking={(booking) => {
            setCellPopup(null);
            setDetail(booking);
          }}
          onBook={bookFromPopup}
          onClose={() => setCellPopup(null)}
        />
      )}

      {detail && (
        <BookingDetail
          booking={detail}
          roomName={resolveRoomName(detail)}
          canManage={canManage}
          onEdit={() => openEdit(detail)}
          onCancel={handleCancel}
          onClose={() => setDetail(null)}
        />
      )}

      {formState && (
        <Modal
          title={formState.editingId ? "Edit booking" : "Book a room"}
          onClose={() => setFormState(null)}
          wide
        >
          <BookingForm
            initial={formState.initial}
            editingId={formState.editingId}
            rooms={rooms}
            courses={courses}
            classes={classes}
            teachers={teachers}
            allBookings={bookings}
            onClose={() => setFormState(null)}
            onSaved={(msg) => {
              setFormState(null);
              setNotice(msg);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
