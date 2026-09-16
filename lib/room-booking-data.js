"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db, auth } from "./firebase";

// ---------------------------------------------------------------------------
// Room Booking (classroom reservation calendar)
//
// ROOMS ARE FULLY DYNAMIC. There is no fixed list anywhere — rooms live in
// their own `rooms` collection, created/edited/deactivated by Admin/
// Director from the Room Booking page's "Rooms" tab. The room filter, the
// Book-Room form's Room dropdown and every calendar column are generated
// from that collection at runtime; adding a 9th room (or deactivating one)
// changes the UI with no code change.
//
// A booking = one physical room held for one EXISTING course + class +
// teacher on one date and time range. It references courseId / classId /
// teacherId from the existing LMS collections — never a duplicate
// course/class/teacher record. A few display fields (courseTitle,
// className, teacherName, roomName) are denormalised onto the booking so
// the calendar renders (and stays readable offline) without re-joining.
//
// OFFLINE-FIRST: reads are plain `onSnapshot` listeners, which the
// Firestore persistent local cache (enabled once in lib/firebase.js)
// already serves offline and reconciles on reconnect. Writes go straight
// through the client SDK too: when offline, Firestore queues the write in
// its own local persistence and flushes it when the network returns (this
// IS the app's sync queue — there is no separate one). We race each write
// against a short timeout so a fast rejection (permission / validation)
// still surfaces, but an offline/slow write doesn't block the UI.
//
// DOUBLE-BOOKING: checked client-side (findConflict) against the live /
// cached booking list before every write, because a Firestore security
// rule cannot query a collection for an overlapping time range. Collisions
// created by two people while both offline are surfaced afterwards by
// `annotateConflicts`, never silently accepted.
// ---------------------------------------------------------------------------

export class RoomBookingError extends Error {
  constructor(message, { code, conflict } = {}) {
    super(message);
    this.name = "RoomBookingError";
    this.code = code || "invalid";
    if (conflict) this.conflict = conflict;
  }
}

function assertReady() {
  if (!db) throw new RoomBookingError("The database is not available right now.", { code: "unavailable" });
  if (!auth?.currentUser) throw new RoomBookingError("Your session has expired. Please sign in again.", { code: "auth" });
}

// A Firestore write promise settles only on server acknowledgement — which
// never happens while offline. Let a fast rejection (permission denied,
// validation) surface as a real error, but if the write hasn't confirmed
// within a few seconds assume it's queued locally (offline / flaky link)
// and let the caller proceed — the listener has already shown it and
// Firestore flushes it on reconnect.
function settleWrite(promise) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve({ queued: true }), 6000))]);
}

// Local calendar date "YYYY-MM-DD" (never toISOString, which shifts the
// day across the UTC boundary for anyone not on UTC).
export function ymd(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const mapDocs = (snapshot) => snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
const str = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

// -------------------------------------------------------------------------
// Rooms
// -------------------------------------------------------------------------
function roomRow(entry) {
  return {
    id: entry.id,
    name: entry.name || "Untitled room",
    code: entry.code || "",
    capacity: typeof entry.capacity === "number" ? entry.capacity : null,
    building: entry.building || "",
    floor: entry.floor || "",
    roomType: entry.roomType || "",
    facilities: Array.isArray(entry.facilities) ? entry.facilities : [],
    status: entry.status === "inactive" ? "inactive" : "active",
    createdAt: entry.createdAt || null,
  };
}

// Every room, active or not — the "Rooms" management tab needs the full
// list. Sorted by name so ordering is stable as rooms are added.
export function subscribeRooms(onData, onError) {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, "rooms"),
    (snapshot) => onData(mapDocs(snapshot).map(roomRow).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))),
    (error) => {
      console.error("[room-booking] rooms subscription failed", error?.code || error);
      onError?.(error);
    },
  );
}

export const activeRooms = (rooms) => rooms.filter((room) => room.status === "active");

export function roomLabel(roomId, rooms, fallbackName) {
  const room = rooms.find((entry) => entry.id === roomId);
  return room?.name || fallbackName || "Room";
}

function validateRoom(data) {
  if (!data.name) throw new RoomBookingError("Enter a room name.");
  if (data.capacity !== null && (!Number.isFinite(data.capacity) || data.capacity < 0)) {
    throw new RoomBookingError("Capacity must be a positive number.");
  }
  if (!["active", "inactive"].includes(data.status)) throw new RoomBookingError("Choose a status.");
}

function normalizeRoom(input) {
  const capacityRaw = input.capacity;
  return {
    name: str(input.name, 120),
    code: str(input.code, 60),
    capacity:
      capacityRaw === "" || capacityRaw === null || capacityRaw === undefined ? null : Number(capacityRaw),
    building: str(input.building, 160),
    floor: str(input.floor, 60),
    roomType: str(input.roomType, 80),
    facilities: Array.isArray(input.facilities)
      ? input.facilities.map((item) => str(item, 60)).filter(Boolean).slice(0, 40)
      : str(input.facilities, 600)
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 40),
    status: input.status === "inactive" ? "inactive" : "active",
  };
}

export async function createRoom(input) {
  assertReady();
  const data = normalizeRoom(input);
  validateRoom(data);
  const ref = await addDoc(collection(db, "rooms"), {
    ...data,
    createdBy: auth.currentUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateRoom(roomId, input) {
  assertReady();
  if (!roomId) throw new RoomBookingError("Missing room id.");
  const data = normalizeRoom(input);
  validateRoom(data);
  await updateDoc(doc(db, "rooms", roomId), { ...data, updatedAt: serverTimestamp() });
  return roomId;
}

export async function setRoomStatus(roomId, status) {
  assertReady();
  await updateDoc(doc(db, "rooms", roomId), {
    status: status === "inactive" ? "inactive" : "active",
    updatedAt: serverTimestamp(),
  });
  return roomId;
}

// Hard-deletes the room definition. Callers should block this when the
// room still has upcoming bookings (deactivate instead) — a cancelled or
// past booking keeps its denormalised roomName so history stays readable.
export async function deleteRoom(roomId) {
  assertReady();
  await deleteDoc(doc(db, "rooms", roomId));
  return roomId;
}

// -------------------------------------------------------------------------
// Overlap detection
// -------------------------------------------------------------------------
export const SLOT_KEYS = ["Morning", "Afternoon", "Evening"];
export const SLOT_TIMES = {
  Morning: { startTime: "08:00", endTime: "12:00" },
  Afternoon: { startTime: "13:00", endTime: "17:00" },
  Evening: { startTime: "17:00", endTime: "21:00" },
};
export const SLOT_STATUS_DEFAULT = {
  Morning: "Open",
  Afternoon: "Busy",
  Evening: "Reserved",
};
export const BAR_COLORS = [
  { value: "#0f2b5c", label: "Dark Navy (AI style)" },
  { value: "#eab308", label: "Gold Yellow (Excel style)" },
  { value: "#7e22ce", label: "Purple (PowerPoint style)" },
  { value: "#dc2626", label: "Red (WPLN Workshop style)" },
  { value: "#059669", label: "Emerald Green" },
  { value: "#2563eb", label: "Royal Blue" },
];

export function slotFromStartTime(startTime) {
  if (!startTime) return "Morning";
  const hour = Number(String(startTime).split(":")[0]);
  if (Number.isNaN(hour)) return "Morning";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export function bookingSlot(booking) {
  if (SLOT_KEYS.includes(booking?.slot)) return booking.slot;
  return slotFromStartTime(booking?.startTime);
}

export function bookingEndDate(booking) {
  const end = str(booking?.endDate, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(end) && end >= booking.date) return end;
  return booking?.date || "";
}

export function datesOverlap(startA, endA, startB, endB) {
  return startA <= endB && startB <= endA;
}

export function timesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export function isSameSlotConflict(a, b) {
  return (
    a.roomId === b.roomId &&
    a.status !== "cancelled" &&
    b.status !== "cancelled" &&
    datesOverlap(a.date, bookingEndDate(a), b.date, bookingEndDate(b)) &&
    (bookingSlot(a) === bookingSlot(b) ||
      timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime))
  );
}

export function findConflict(bookings, candidate, ignoreId = null) {
  return (
    bookings.find(
      (booking) => booking.id !== ignoreId && booking.status !== "cancelled" && isSameSlotConflict(booking, candidate),
    ) || null
  );
}

export function annotateConflicts(bookings) {
  const active = bookings.filter((booking) => booking.status !== "cancelled");
  return bookings.map((booking) => {
    if (booking.status === "cancelled") return booking;
    const other = active.find((candidate) => candidate.id !== booking.id && isSameSlotConflict(candidate, booking));
    return other ? { ...booking, conflictWith: other.id } : booking;
  });
}

// -------------------------------------------------------------------------
// Bookings
// -------------------------------------------------------------------------
export function subscribeRoomBookings(onData, onError) {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, "roomBookings"),
    { includeMetadataChanges: true },
    (snapshot) =>
      onData(annotateConflicts(mapDocs(snapshot)), {
        fromCache: snapshot.metadata.fromCache,
        pendingWrites: snapshot.metadata.hasPendingWrites,
      }),
    (error) => {
      console.error("[room-booking] bookings subscription failed", error?.code || error);
      onError?.(error);
    },
  );
}

// Existing LMS data for the booking form — Admin/Director can read all
// courses / classes / teacher users directly per firestore.rules, the
// same way TrainingManagement and training-detail.js already do.
export function subscribeCourses(onData, onError) {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, "courses"),
    (snapshot) =>
      onData(
        mapDocs(snapshot)
          .map((course) => ({
            id: course.id,
            title: course.title || course.name || "Untitled training",
            courseCode: course.courseCode || "",
            status: course.status || "",
            primaryTeacherId: course.primaryTeacherId || "",
            teacherIds: Array.isArray(course.teacherIds) ? course.teacherIds : [],
          }))
          .sort((a, b) => a.title.localeCompare(b.title)),
      ),
    (error) => {
      console.error("[room-booking] courses subscription failed", error?.code || error);
      onError?.(error);
    },
  );
}

export function subscribeClasses(onData, onError) {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, "classes"),
    (snapshot) =>
      onData(
        mapDocs(snapshot).map((batch) => ({
          id: batch.id,
          name: batch.name || "Batch",
          courseId: batch.courseId || "",
          status: batch.status || "",
          teacherIds: Array.isArray(batch.teacherIds) ? batch.teacherIds : [],
        })),
      ),
    (error) => {
      console.error("[room-booking] classes subscription failed", error?.code || error);
      onError?.(error);
    },
  );
}

export function subscribeTeachers(onData, onError) {
  if (!db) return () => {};
  return onSnapshot(
    query(collection(db, "users"), where("role", "==", "Teacher")),
    (snapshot) =>
      onData(
        mapDocs(snapshot)
          .map((teacher) => ({
            id: teacher.id,
            name: teacher.displayName || teacher.name || teacher.email || "Teacher",
            email: teacher.email || "",
            active: teacher.active !== false,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      ),
    (error) => {
      console.error("[room-booking] teachers subscription failed", error?.code || error);
      onError?.(error);
    },
  );
}

function normalizeBooking(input) {
  const date = str(input.date, 10);
  const endDateRaw = str(input.endDate, 10);
  const slot = SLOT_KEYS.includes(input.slot) ? input.slot : slotFromStartTime(input.startTime);
  const times = SLOT_TIMES[slot] || SLOT_TIMES.Morning;
  const startTime = /^\d{2}:\d{2}$/.test(str(input.startTime, 5)) ? str(input.startTime, 5) : times.startTime;
  const endTime = /^\d{2}:\d{2}$/.test(str(input.endTime, 5)) ? str(input.endTime, 5) : times.endTime;
  const slotStatus = ["Open", "Busy", "Reserved"].includes(input.slotStatus)
    ? input.slotStatus
    : SLOT_STATUS_DEFAULT[slot];
  return {
    roomId: str(input.roomId, 200),
    courseId: str(input.courseId, 200),
    courseTitle: str(input.courseTitle, 200),
    classId: str(input.classId, 200),
    className: str(input.className, 200),
    teacherId: str(input.teacherId, 200),
    teacherName: str(input.teacherName, 200),
    roomName: str(input.roomName, 160),
    date,
    endDate: /^\d{4}-\d{2}-\d{2}$/.test(endDateRaw) && endDateRaw >= date ? endDateRaw : date,
    startTime,
    endTime,
    slot,
    barColor: str(input.barColor, 20) || "#0f2b5c",
    slotStatus,
    notes: str(input.notes, 1000),
  };
}

function validateBooking(data) {
  if (!data.roomId) throw new RoomBookingError("Choose a room.");
  if (!data.courseId) throw new RoomBookingError("Choose a course.");
  if (!data.classId) throw new RoomBookingError("Choose a class / batch.");
  if (!data.teacherId) throw new RoomBookingError("Choose a teacher.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new RoomBookingError("Choose a start date.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.endDate)) throw new RoomBookingError("Choose an end date.");
  if (data.endDate < data.date) throw new RoomBookingError("End day must be on or after the start day.");
  if (!/^\d{2}:\d{2}$/.test(data.startTime)) throw new RoomBookingError("Choose a start time.");
  if (!/^\d{2}:\d{2}$/.test(data.endTime)) throw new RoomBookingError("Choose an end time.");
  if (data.endTime <= data.startTime) throw new RoomBookingError("End time must be after the start time.");
}

async function assertSlotFree(data, ignoreId) {
  const snapshot = await getDocs(query(collection(db, "roomBookings"), where("roomId", "==", data.roomId)));
  const conflict = findConflict(mapDocs(snapshot), data, ignoreId);
  if (conflict) {
    throw new RoomBookingError(
      `${data.roomName || "That room"} is already booked from ${conflict.startTime} to ${conflict.endTime} that day (${conflict.courseTitle || "another class"}). Pick another room or time.`,
      { code: "conflict", conflict },
    );
  }
}

export async function createRoomBooking(input, meta = {}) {
  assertReady();
  const data = normalizeBooking(input);
  validateBooking(data);
  await assertSlotFree(data, null);

  const ref = doc(collection(db, "roomBookings"));
  const payload = {
    ...data,
    status: "scheduled",
    createdBy: auth.currentUser.uid,
    createdByName: str(meta.createdByName, 200),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const write = setDoc(ref, payload);
  write.catch((error) => console.error("[room-booking] create write failed", error?.code || error));
  await settleWrite(write);
  return ref.id;
}

export async function updateRoomBooking(bookingId, input, meta = {}) {
  assertReady();
  if (!bookingId) throw new RoomBookingError("Missing booking id.");
  const data = normalizeBooking(input);
  validateBooking(data);
  await assertSlotFree(data, bookingId);

  const write = updateDoc(doc(db, "roomBookings", bookingId), {
    ...data,
    updatedBy: auth.currentUser.uid,
    updatedByName: str(meta.updatedByName, 200),
    updatedAt: serverTimestamp(),
  });
  write.catch((error) => console.error("[room-booking] update write failed", error?.code || error));
  await settleWrite(write);
  return bookingId;
}

// A cancel is a soft status change (never a hard delete) so the schedule
// keeps an audit trail and the freed slot simply reads "Available" again.
export async function cancelRoomBooking(bookingId, meta = {}) {
  assertReady();
  if (!bookingId) throw new RoomBookingError("Missing booking id.");
  const write = updateDoc(doc(db, "roomBookings", bookingId), {
    status: "cancelled",
    cancelledBy: auth.currentUser.uid,
    cancelledByName: str(meta.cancelledByName, 200),
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  write.catch((error) => console.error("[room-booking] cancel write failed", error?.code || error));
  await settleWrite(write);
  return bookingId;
}

// -------------------------------------------------------------------------
// Perceived-speed only — mirrors lib/student-data.js's prefetchMyTraining,
// but for a GLOBAL data set (Rooms and Bookings are visible to every
// Admin/Director, not scoped to one uid — so unlike prefetchMyTraining's
// per-uid Map, this just keeps one shared latest-rows cache). Fired from
// app/dashboard/[role]/page.jsx the moment the dashboard mounts, before the
// user has clicked into "Room Booking"; RoomBooking.jsx seeds its own state
// from this cache on mount (instant if the prefetch already delivered
// data) and then establishes its own live subscriptions as before — a
// small duplicate listener while both are alive, not a replacement.
// -------------------------------------------------------------------------
let cachedRooms = null;
let cachedBookings = null;
let cachedBookingsMeta = null;
let warmedRoomBooking = false;

export function prefetchRoomBooking() {
  if (warmedRoomBooking) return;
  warmedRoomBooking = true;
  subscribeRooms((rows) => { cachedRooms = rows; }, () => {});
  subscribeRoomBookings((rows, meta) => { cachedBookings = rows; cachedBookingsMeta = meta; }, () => {});
}
export const getCachedRooms = () => cachedRooms;
export const getCachedBookings = () => cachedBookings;
export const getCachedBookingsMeta = () => cachedBookingsMeta;
