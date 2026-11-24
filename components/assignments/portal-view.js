// Pure helpers behind the Assignment Portal's Dashboard, Submission Table and
// Outstanding tabs. Everything works on the `batches` the portal API returns
// (lib/server/assignment-portal.js): one entry per training, with its
// published assignments (each with a fixed `number` and a `date`) and every
// enrolled student's `expected` assignment ids and `done` submissions.

const pad = (value) => String(value).padStart(2, "0");
const isoDay = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const today = () => isoDay(new Date());

// "Course" in the filter bar: the training's category, or its title when it
// has none (several batches of the same course share one).
export const courseOf = (batch) => batch.category || batch.title;
export const batchLabel = (batch) => [batch.courseCode, batch.title, batch.batchName].filter(Boolean).join(" · ");

export const doneCount = (student) => student.expected.filter((id) => student.done[id]).length;
export const percent = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

export function courseOptions(batches) {
  return [...new Set(batches.map(courseOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function batchOptions(batches, course) {
  return batches.filter((batch) => !course || courseOf(batch) === course);
}

// Keeps the chosen course/batch, and only the assignments whose date (due
// date, or the day it was set) is inside from–to. A student's `expected`
// list shrinks with them, so every count below follows the filter.
export function applyFilters(batches, { course = "", batchId = "", from = "", to = "" } = {}) {
  const dated = Boolean(from || to);
  return batches
    .filter((batch) => (!course || courseOf(batch) === course) && (!batchId || batch.id === batchId))
    .map((batch) => {
      if (!dated) return batch;
      const assignments = batch.assignments.filter((item) => item.date && (!from || item.date >= from) && (!to || item.date <= to));
      const keep = new Set(assignments.map((item) => item.id));
      return { ...batch, assignments, students: batch.students.map((student) => ({ ...student, expected: student.expected.filter((id) => keep.has(id)) })) };
    })
    .filter((batch) => !dated || batch.assignments.length);
}

// The three headline numbers (Total Active Students, Training Batches,
// Assignments Submitted).
export function totalsOf(batches) {
  const students = new Map();
  batches.forEach((batch) => batch.students.forEach((s) => {
    const prev = students.get(s.studentId) || { owed: 0, done: 0 };
    students.set(s.studentId, { owed: prev.owed + s.expected.length, done: prev.done + doneCount(s) });
  }));
  const owing = [...students.values()].filter((s) => s.owed);
  const owed = owing.reduce((sum, s) => sum + s.owed, 0);
  const submitted = owing.reduce((sum, s) => sum + s.done, 0);
  return {
    students: students.size,
    engagement: percent(owing.filter((s) => s.done).length, owing.length),
    active: batches.filter((b) => b.status === "Active").length,
    submitted,
    owed,
    rate: percent(submitted, owed),
    biggest: [...batches].sort((a, b) => b.students.length - a.students.length).slice(0, 6),
  };
}

// ---------------------------------------------------------------------------
// Submission Table: one row per student per training batch; columns are the
// assignment numbers (Assignment 01, 02, …) found in the filtered batches.
// ---------------------------------------------------------------------------
export function matrixRows(batches) {
  return batches.flatMap((batch) => batch.students.map((student) => ({ ...student, key: `${batch.id}_${student.studentId}`, batch })));
}

export function matrixNumbers(batches) {
  return [...new Set(batches.flatMap((batch) => batch.assignments.map((item) => item.number)))].sort((a, b) => a - b);
}

// "done" | "missing" | "none" (not set for this student / no such assignment).
export function matrixCell(row, number) {
  const assignment = row.batch.assignments.find((item) => item.number === number);
  if (!assignment || !row.expected.includes(assignment.id)) return { status: "none", assignment };
  const submission = row.done[assignment.id];
  return { status: submission ? "done" : "missing", assignment, submission };
}

// ---------------------------------------------------------------------------
// Outstanding: every student still owing work, with what they owe.
// ---------------------------------------------------------------------------
export function outstandingRows(batches, { overdueOnly = false, on = today() } = {}) {
  const rows = [];
  batches.forEach((batch) => batch.students.forEach((student) => {
    let missing = batch.assignments
      .filter((item) => student.expected.includes(item.id) && !student.done[item.id])
      .map((item) => ({ ...item, overdue: Boolean(item.dueDate && item.dueDate < on) }));
    if (overdueOnly) missing = missing.filter((item) => item.overdue);
    if (!missing.length) return;
    rows.push({ ...student, key: `${batch.id}_${student.studentId}`, batch, missing, overdue: missing.filter((item) => item.overdue).length });
  }));
  return rows.sort((a, b) => b.missing.length - a.missing.length || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Charts
// ---------------------------------------------------------------------------
const DAY = 86400000;
const parseDay = (value) => {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const mondayOf = (date) => {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
};
const shortDay = (date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// Submissions per week (per month for ranges over half a year), zero-filled:
// the filter's date range, or the last 12 weeks.
export function submissionTrend(batches, { from = "", to = "" } = {}) {
  const end = to ? parseDay(to) : new Date();
  const start = from ? parseDay(from) : new Date(end.getTime() - 11 * 7 * DAY);
  const monthly = end - start > 26 * 7 * DAY;
  const keyOf = (date) => (monthly ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}` : isoDay(mondayOf(date)));

  const buckets = new Map();
  const cursor = monthly ? new Date(start.getFullYear(), start.getMonth(), 1) : mondayOf(start);
  while (cursor <= end && buckets.size < 60) {
    buckets.set(keyOf(cursor), {
      label: monthly ? cursor.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }) : shortDay(cursor),
      monthly,
      onTime: 0,
      late: 0,
    });
    if (monthly) cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 7);
  }
  batches.forEach((batch) => batch.students.forEach((student) => student.expected.forEach((id) => {
    const submission = student.done[id];
    if (!submission?.submittedAt) return;
    const bucket = buckets.get(keyOf(new Date(submission.submittedAt)));
    if (bucket) bucket[submission.late ? "late" : "onTime"] += 1;
  })));
  return [...buckets.values()].map((row) => ({ ...row, total: row.onTime + row.late }));
}

// Share of owed assignments each batch has handed in (the 10 biggest).
export function batchRates(batches) {
  return batches
    .map((batch) => {
      const owed = batch.students.reduce((sum, s) => sum + s.expected.length, 0);
      const submitted = batch.students.reduce((sum, s) => sum + doneCount(s), 0);
      return { id: batch.id, label: batch.courseCode || batch.title, title: batch.title, owed, submitted, rate: percent(submitted, owed) };
    })
    .filter((row) => row.owed)
    .sort((a, b) => b.owed - a.owed)
    .slice(0, 10)
    .sort((a, b) => b.rate - a.rate);
}

// On time / late / missing for Assignment 01, 02, … across the batches.
export function statusByNumber(batches) {
  const rows = new Map();
  batches.forEach((batch) => batch.assignments.forEach((item) => {
    const row = rows.get(item.number) || { number: item.number, onTime: 0, late: 0, missing: 0 };
    batch.students.forEach((student) => {
      if (!student.expected.includes(item.id)) return;
      const submission = student.done[item.id];
      if (!submission) row.missing += 1;
      else if (submission.late) row.late += 1;
      else row.onTime += 1;
    });
    rows.set(item.number, row);
  }));
  return [...rows.values()].sort((a, b) => a.number - b.number).map((row) => ({ ...row, label: `A${pad(row.number)}` }));
}
