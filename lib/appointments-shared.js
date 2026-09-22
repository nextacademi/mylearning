// Client-safe constants/helpers shared by the appointment API
// (lib/server/appointment-core.js) and the scheduler UI
// (components/appointments/AppointmentScheduler.jsx) so the two can never
// disagree on which time slots exist. Times are the academy's local time.
export const MORNING_SLOTS = ["9:00 AM", "9:30 AM", "10:15 AM", "11:00 AM", "11:45 AM"];
export const EVENING_SLOTS = ["5:00 PM", "5:30 PM", "6:00 PM", "6:30 PM", "7:00 PM"];
export const ALL_SLOTS = [...MORNING_SLOTS, ...EVENING_SLOTS];

export const slotIndex = (time) => {
  const index = ALL_SLOTS.indexOf(time);
  return index === -1 ? ALL_SLOTS.length : index;
};

// Minutes since midnight for a "10:15 AM" style slot.
export function slotMinutes(time) {
  const match = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(time);
  if (!match) return 0;
  return ((Number(match[1]) % 12) + (match[3] === "PM" ? 12 : 0)) * 60 + Number(match[2]);
}

// One appointment per slot academy-wide (a single advisor), so the slot
// itself is the document id — Firestore then guarantees no double booking.
export const slotKey = (date, time) => `${date}_${time.replace(/[^0-9A-Za-z]/g, "")}`;
