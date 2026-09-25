import { NextResponse } from "next/server";
import { getAdminDb } from "../../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A real, subscribable iCalendar (.ics) feed of every published academy
// event — the same `academyEvents` collection (published == true) the
// public homepage's live event list already reads. No auth required (this
// is what a "Subscribe" button hands to Apple/Google Calendar, which fetch
// it themselves on their own refresh schedule, not through a signed-in
// session), so this uses the Admin SDK server-side rather than depend on
// the client-readable Firestore rule.

function escapeText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Folds a line at 75 octets per RFC 5545 (continuation lines start with a
// single space) — most calendar apps tolerate long lines, but folding is
// cheap insurance against the strict ones.
function foldLine(line) {
  if (line.length <= 75) return line;
  const parts = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }
  parts.push(rest);
  return parts.join("\r\n");
}

function toDateStamp(date) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export async function GET() {
  try {
    const db = getAdminDb();
    const snapshot = await db.collection("academyEvents").where("published", "==", true).get();
    const now = toDateStamp(new Date());

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Next Academy//Events//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Next Academy Events",
      "X-WR-TIMEZONE:Asia/Singapore",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
      // Events below reference TZID=Asia/Singapore. Google resolves that
      // name itself, but strict RFC 5545 clients (Outlook, some Apple
      // versions) need the zone defined in the feed. Singapore has no DST,
      // so a single fixed-offset STANDARD block is complete.
      "BEGIN:VTIMEZONE",
      "TZID:Asia/Singapore",
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      "TZOFFSETFROM:+0800",
      "TZOFFSETTO:+0800",
      "TZNAME:SGT",
      "END:STANDARD",
      "END:VTIMEZONE",
    ];

    snapshot.docs.forEach((doc) => {
      const event = doc.data();
      if (!event.eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(event.eventDate)) return;
      const dateCompact = event.eventDate.replace(/-/g, "");
      const hasTime = event.startTime && /^\d{2}:\d{2}$/.test(event.startTime);

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${doc.id}@nextacademy.sg`);
      lines.push(`DTSTAMP:${now}`);
      if (hasTime) {
        const start = `${dateCompact}T${event.startTime.replace(":", "")}00`;
        lines.push(`DTSTART;TZID=Asia/Singapore:${start}`);
        if (event.endTime && /^\d{2}:\d{2}$/.test(event.endTime)) {
          const end = `${dateCompact}T${event.endTime.replace(":", "")}00`;
          lines.push(`DTEND;TZID=Asia/Singapore:${end}`);
        }
      } else {
        lines.push(`DTSTART;VALUE=DATE:${dateCompact}`);
      }
      lines.push(foldLine(`SUMMARY:${escapeText(event.name)}`));
      if (event.location) lines.push(foldLine(`LOCATION:${escapeText(event.location)}`));
      if (event.description) lines.push(foldLine(`DESCRIPTION:${escapeText(event.description)}`));
      lines.push("END:VEVENT");
    });

    lines.push("END:VCALENDAR");

    // RFC 5545: every content line, including the last, ends with CRLF.
    return new NextResponse(`${lines.join("\r\n")}\r\n`, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="next-academy-events.ics"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[events-calendar] failed", { message: error?.message });
    return NextResponse.json({ message: "Unable to generate calendar feed." }, { status: 500 });
  }
}
