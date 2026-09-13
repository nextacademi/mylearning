"use client";

import React, { useMemo } from "react";
import { Bookmark } from "lucide-react";
import {
  SLOT_KEYS,
  SLOT_STATUS_DEFAULT,
  SLOT_TIMES,
  bookingEndDate,
  bookingSlot,
} from "../../lib/room-booking-data";

function padDay(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function slotBadgeClass(slot) {
  if (slot === "Morning") return "rb-slot-morning";
  if (slot === "Afternoon") return "rb-slot-afternoon";
  return "rb-slot-evening";
}

function statusClass(status) {
  if (status === "Open") return "rb-status-open";
  if (status === "Reserved") return "rb-status-reserved";
  return "rb-status-busy";
}

function roomAccent(index) {
  if (index === 1) return "#6b21a8";
  if (index === 2 || index === 3) return "#dc2626";
  return "#0f172a";
}

function sizeAccent(slot) {
  if (slot === "Morning") return "#6b21a8";
  if (slot === "Afternoon") return "#dc2626";
  return "#ea580c";
}

function roomLabel(room) {
  return room?.code || room?.name || "Room";
}

export function coversMonthDay(booking, year, month, day) {
  const key = padDay(year, month, day);
  return booking.date <= key && bookingEndDate(booking) >= key;
}

export function monthBookingsFor(visible, year, month) {
  const start = padDay(year, month, 1);
  const end = padDay(year, month, new Date(year, month + 1, 0).getDate());
  return visible.filter((booking) => {
    if (!booking.date) return false;
    return datesTouch(booking.date, bookingEndDate(booking), start, end);
  });
}

function datesTouch(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

export function occupancyStats(rooms, monthVisible, daysInMonth, monthKey) {
  const totalRooms = rooms.length;
  const totalSlots = totalRooms * SLOT_KEYS.length;
  const activeBookings = monthVisible.length;
  const possible = totalSlots * daysInMonth;
  const monthStart = `${monthKey}-01`;
  const monthEnd = `${monthKey}-${String(daysInMonth).padStart(2, "0")}`;
  let bookedDays = 0;
  monthVisible.forEach((booking) => {
    const start = booking.date;
    const end = bookingEndDate(booking);
    if (!start || end < monthStart || start > monthEnd) return;
    const from = start < monthStart ? monthStart : start;
    const to = end > monthEnd ? monthEnd : end;
    bookedDays += Math.round((Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86400000) + 1;
  });
  const occupancy = possible > 0 ? ((bookedDays / possible) * 100).toFixed(1) : "0.0";
  return { totalRooms, totalSlots, activeBookings, occupancy };
}

function bookingForCell(bookings, roomId, slot, year, month, day) {
  return bookings.find(
    (booking) =>
      String(booking.roomId) === String(roomId) &&
      bookingSlot(booking) === slot &&
      coversMonthDay(booking, year, month, day),
  );
}

function barStartsToday(booking, year, month, day) {
  const key = padDay(year, month, day);
  if (booking.date === key) return true;
  return day === 1 && booking.date < key && bookingEndDate(booking) >= key;
}

function spanFrom(booking, year, month, day, daysInMonth) {
  const endKey = bookingEndDate(booking);
  const endDay =
    endKey.slice(0, 7) === padDay(year, month, 1).slice(0, 7)
      ? Math.min(Number(endKey.slice(8, 10)), daysInMonth)
      : daysInMonth;
  return Math.max(1, endDay - day + 1);
}

export function ScheduleMatrix({
  cursor,
  rooms,
  bookings,
  roomFilter,
  searchQuery,
  density,
  canManage,
  onSelectBooking,
  onBookCell,
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const query = (searchQuery || "").trim().toLowerCase();

  const isWeekend = (day) => {
    const weekday = new Date(year, month, day).getDay();
    return weekday === 5 || weekday === 6;
  };

  const roomList = useMemo(() => {
    const list =
      roomFilter === "all"
        ? rooms
        : rooms.filter((room) => String(room.id) === String(roomFilter));
    return list;
  }, [rooms, roomFilter]);

  return (
    <div
      id="gridMatrixContainer"
      className="overflow-hidden rounded-xl border border-slate-300 bg-card shadow-md"
    >
      <div className="rb-scroll relative max-h-[72vh] overflow-auto">
        <table
          className={`rb-matrix ${density === "compact" ? "density-compact" : ""}`}
        >
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-14 bg-card px-1 py-1.5 text-[11px]">
                Room
              </th>
              <th className="sticky left-14 z-20 w-10 bg-card px-0.5 py-1.5 text-[11px]">
                Size
              </th>
              <th className="sticky left-[96px] z-20 w-16 bg-card px-1 py-1.5 text-[11px]">
                Slot
              </th>
              <th className="sticky left-[160px] z-20 w-16 border-r-2 border-slate-400 bg-card px-1 py-1.5 text-[11px]">
                Status
              </th>
              <th
                colSpan={daysInMonth}
                className="border-b bg-slate-100 py-1 text-xs font-bold text-slate-700"
              >
                Days of Month (1 - {daysInMonth})
              </th>
            </tr>
            <tr className="bg-card font-bold text-slate-800">
              <th className="sticky left-0 z-20 bg-card" />
              <th className="sticky left-14 z-20 bg-card" />
              <th className="sticky left-[96px] z-20 bg-card" />
              <th className="sticky left-[160px] z-20 border-r-2 border-slate-400 bg-card" />
              {days.map((day) => (
                <th
                  key={day}
                  className={`rb-day-h w-7 min-w-[28px] max-w-[28px] border-r border-slate-300 py-1 text-center text-[11px] font-bold ${
                    isWeekend(day) ? "rb-weekend" : "bg-slate-50"
                  }`}
                >
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roomList.map((room, roomIdx) =>
              SLOT_KEYS.map((slot, slotIdx) => {
                const active = bookings.find(
                  (booking) =>
                    String(booking.roomId) === String(room.id) &&
                    bookingSlot(booking) === slot,
                );
                const displayStatus =
                  active?.slotStatus || SLOT_STATUS_DEFAULT[slot];
                const cells = [];
                let day = 1;
                while (day <= daysInMonth) {
                  const covering = bookingForCell(
                    bookings,
                    room.id,
                    slot,
                    year,
                    month,
                    day,
                  );
                  const matchesSearch =
                    !query ||
                    (covering &&
                      (covering.courseTitle || "")
                        .toLowerCase()
                        .includes(query));
                  if (covering && matchesSearch && barStartsToday(covering, year, month, day)) {
                    const span = spanFrom(covering, year, month, day, daysInMonth);
                    cells.push(
                      <td
                        key={`${room.id}-${slot}-${day}`}
                        colSpan={span}
                        className="relative p-0.5 align-middle"
                      >
                        <button
                          type="button"
                          className="rb-bar"
                          style={{ backgroundColor: covering.barColor || "#0f2b5c" }}
                          title={`${covering.courseTitle || "Booking"} | ${roomLabel(room)} (${slot}) | ${covering.date} – ${bookingEndDate(covering)}`}
                          onClick={() => onSelectBooking(covering)}
                        >
                          <span className="truncate px-1">
                            {covering.courseTitle || "Booked"}
                          </span>
                        </button>
                      </td>,
                    );
                    day += span;
                  } else {
                    const dateKey = padDay(year, month, day);
                    const currentDay = day;
                    cells.push(
                      <td
                        key={`${room.id}-${slot}-${day}`}
                        className={`h-6 ${isWeekend(day) ? "rb-weekend" : ""}`}
                      >
                        {canManage ? (
                          <button
                            type="button"
                            className="h-full min-h-[22px] w-full hover:bg-red-50/60"
                            aria-label={`Book ${roomLabel(room)} ${slot} on ${dateKey}`}
                            onClick={() => {
                              const endDay = Math.min(currentDay + 6, daysInMonth);
                              const times = SLOT_TIMES[slot];
                              onBookCell({
                                roomId: room.id,
                                slot,
                                date: dateKey,
                                endDate: padDay(year, month, endDay),
                                startTime: times.startTime,
                                endTime: times.endTime,
                                slotStatus: SLOT_STATUS_DEFAULT[slot],
                              });
                            }}
                          />
                        ) : null}
                      </td>,
                    );
                    day += 1;
                  }
                }
                return (
                  <tr
                    key={`${room.id}-${slot}`}
                    className="transition-colors hover:bg-slate-50/80"
                  >
                    {slotIdx === 0 && (
                      <td
                        rowSpan={3}
                        className="sticky left-0 z-10 border-r border-slate-300 bg-card text-center text-xs font-extrabold"
                        style={{ color: roomAccent(roomIdx) }}
                      >
                        {roomLabel(room)}
                      </td>
                    )}
                    <td
                      className="sticky left-14 z-10 border-r border-slate-300 bg-card text-[11px] font-bold"
                      style={{ color: sizeAccent(slot) }}
                    >
                      {room.capacity ?? "—"}
                    </td>
                    <td
                      className={`sticky left-[96px] z-10 border-r border-slate-300 px-1 py-0.5 text-[10px] ${slotBadgeClass(slot)}`}
                    >
                      {slot}
                    </td>
                    <td
                      className={`sticky left-[160px] z-10 border-r-2 border-slate-400 bg-card px-1 py-0.5 text-[10px] ${statusClass(displayStatus)}`}
                    >
                      {displayStatus}
                    </td>
                    {cells}
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MobileCards({
  rooms,
  bookings,
  roomFilter,
  searchQuery,
  weekFilter,
  cursor,
  canManage,
  onSelectBooking,
  onBookCell,
}) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const query = (searchQuery || "").trim().toLowerCase();

  let minDay = 1;
  let maxDay = daysInMonth;
  if (weekFilter === "w1") {
    minDay = 1;
    maxDay = 7;
  } else if (weekFilter === "w2") {
    minDay = 8;
    maxDay = 14;
  } else if (weekFilter === "w3") {
    minDay = 15;
    maxDay = 21;
  } else if (weekFilter === "w4") {
    minDay = 22;
    maxDay = daysInMonth;
  }

  const rangeStart = padDay(year, month, minDay);
  const rangeEnd = padDay(year, month, maxDay);
  const list =
    roomFilter === "all"
      ? rooms
      : rooms.filter((room) => String(room.id) === String(roomFilter));

  return (
    <div className="space-y-3">
      {list.map((room) => (
        <div
          key={room.id}
          className="space-y-2 rounded-xl border border-slate-200 bg-card p-3 shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <span className="rounded-lg border bg-slate-100 px-2 py-0.5 text-sm font-black text-slate-900">
                Room {roomLabel(room)}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                Capacity: {room.capacity ?? "—"}
              </span>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() =>
                  onBookCell({
                    roomId: room.id,
                    slot: "Morning",
                    date: rangeStart,
                    endDate: padDay(year, month, Math.min(minDay + 6, daysInMonth)),
                    startTime: SLOT_TIMES.Morning.startTime,
                    endTime: SLOT_TIMES.Morning.endTime,
                  })
                }
                className="rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-100"
              >
                + Book
              </button>
            )}
          </div>
          <div className="space-y-1.5 pt-1">
            {SLOT_KEYS.map((slot) => {
              const active = bookings.find(
                (booking) =>
                  String(booking.roomId) === String(room.id) &&
                  bookingSlot(booking) === slot &&
                  datesTouch(
                    booking.date,
                    bookingEndDate(booking),
                    rangeStart,
                    rangeEnd,
                  ),
              );
              if (
                query &&
                active &&
                !(active.courseTitle || "").toLowerCase().includes(query)
              ) {
                return null;
              }
              if (active) {
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => onSelectBooking(active)}
                    className="flex w-full cursor-pointer items-center justify-between rounded-lg p-2 text-left text-xs font-bold text-white shadow-sm"
                    style={{ backgroundColor: active.barColor || "#0f2b5c" }}
                  >
                    <div>
                      <div className="text-[11px] uppercase tracking-wider opacity-80">
                        {slot} Slot
                      </div>
                      <div className="truncate text-xs font-black">
                        {active.courseTitle || "Booking"}
                      </div>
                    </div>
                    <div className="text-right text-[11px]">
                      <div>
                        {active.date.slice(8)} – {bookingEndDate(active).slice(8)}
                      </div>
                      <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">
                        {active.slotStatus || "Busy"}
                      </span>
                    </div>
                  </button>
                );
              }
              const status = SLOT_STATUS_DEFAULT[slot];
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => {
                    if (!canManage) return;
                    const times = SLOT_TIMES[slot];
                    onBookCell({
                      roomId: room.id,
                      slot,
                      date: rangeStart,
                      endDate: padDay(year, month, Math.min(minDay + 6, daysInMonth)),
                      startTime: times.startTime,
                      endTime: times.endTime,
                      slotStatus: status,
                    });
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600 hover:bg-slate-100"
                >
                  <span className="text-[11px] font-semibold">{slot} Slot</span>
                  <span
                    className={`text-[10px] font-bold ${
                      status === "Open" ? "text-purple-700" : "text-slate-500"
                    }`}
                  >
                    {canManage ? `+ Tap to schedule (${status})` : status}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {!list.length && (
        <p className="rounded-xl border border-dashed border-slate-200 bg-card py-10 text-center text-sm text-slate-500">
          No rooms yet. Add a classroom to start booking.
        </p>
      )}
    </div>
  );
}

export function MatrixLegend() {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-card p-2.5 text-xs shadow-sm sm:mb-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold sm:gap-4">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Slots:
        </span>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#3b0764]" />
          <span>Morning</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#dc2626]" />
          <span>Afternoon</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#ea580c]" />
          <span>Evening</span>
        </div>
        <div className="flex items-center gap-1 border-l border-slate-200 pl-2 text-slate-600">
          <span className="inline-block h-2.5 w-2.5 rounded-sm border border-amber-300 bg-[#fef08a]" />
          <span>Weekend</span>
        </div>
      </div>
      <div className="flex items-center gap-1 text-[11px] italic text-slate-500">
        <Bookmark className="h-3 w-3 text-slate-400" />
        <span>Tap or click any cell to schedule</span>
      </div>
    </div>
  );
}
