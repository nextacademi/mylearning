// The academy runs on Singapore time; the server clock is UTC. Using the
// UTC date ("toISOString().slice(0, 10)") would file anything between
// 00:00 and 08:00 SGT under the previous day.
export function singaporeDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(now);
}
