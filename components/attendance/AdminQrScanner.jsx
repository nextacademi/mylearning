"use client";

import { useEffect, useRef, useState } from "react";
import { loadTraining } from "../../lib/services/training-service";
import { subscribeCourseClasses } from "../../lib/training-detail";
import { subscribeCourseClassSessions } from "../../lib/class-sessions-data";
import { scanAttendanceQr } from "../../lib/services/qr-service";

const SCANNER_ELEMENT_ID = "admin-qr-scanner";

// Admin/Director's own QR scanner — the "Scan QR Code" module was already
// listed in their sidebar (app/dashboard/[role]/page.jsx's roleConfig) but
// had no dispatch, so it silently fell through to the dashboard home. This
// reuses the exact same /api/teacher/attendance/scan endpoint and
// html5-qrcode camera flow as Teacher's ScanQrView (now extended there too
// to accept Admin/Director) — no second attendance/QR system, just Admin/
// Director's own Training → Class → Session picker since, unlike a
// Teacher, they don't have one fixed set of "their own" classes.
export default function AdminQrScanner() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState("");
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const scannerRef = useRef(null);

  useEffect(() => {
    loadTraining().then((data) => setCourses(data.courses || [])).catch(() => setCourses([]));
  }, []);
  useEffect(() => {
    if (!courseId) return undefined;
    const unsubClasses = subscribeCourseClasses(courseId, setClasses, () => {});
    const unsubSessions = subscribeCourseClassSessions(courseId, setSessions, () => {});
    return () => {
      unsubClasses();
      unsubSessions();
    };
  }, [courseId]);

  const todaySessions = sessions.filter((item) => item.classId === classId && item.date === new Date().toISOString().slice(0, 10) && item.status !== "cancelled");

  async function handleToken(token) {
    if (!classId || !token || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await scanAttendanceQr({ token, classId, ...(sessionId ? { sessionId } : {}) });
      setResult({ ok: true, ...response });
    } catch (error) {
      setResult({ ok: false, message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function startScanning() {
    setCameraError("");
    setResult(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(SCANNER_ELEMENT_ID);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 220 },
        async (decodedText) => {
          await scanner.stop().catch(() => {});
          setScanning(false);
          handleToken(decodedText);
        },
        () => {},
      );
      setScanning(true);
    } catch (error) {
      setCameraError(
        error?.message?.includes("Permission")
          ? "Camera permission was denied. Use manual entry below instead."
          : "Unable to access the camera. Use manual entry below instead.",
      );
    }
  }

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 shadow-xl">
        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Attendance</p>
        <h2 className="mt-2 text-3xl font-black text-ink">Scan QR Code</h2>
        <p className="mt-2 text-sm text-muted">Check students in/out of an offline class using their D Card QR code.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_.8fr]">
        <div className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap gap-2">
            <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setClassId(""); setSessionId(""); }} className="rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs">
              <option value="">Select training</option>
              {courses.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            {courseId && (
              <select value={classId} onChange={(e) => { setClassId(e.target.value); setSessionId(""); }} className="rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs">
                <option value="">Select class</option>
                {classes.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}
              </select>
            )}
            {classId && todaySessions.length > 0 && (
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} className="rounded-xl border border-border-subtle bg-page px-3 py-2 text-xs">
                <option value="">No specific session</option>
                {todaySessions.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.startTime}–{item.endTime}</option>)}
              </select>
            )}
          </div>

          {!classId ? (
            <p className="py-10 text-center text-sm text-muted">Select a training and class before scanning.</p>
          ) : (
            <>
              <div id={SCANNER_ELEMENT_ID} className="mx-auto max-w-sm overflow-hidden rounded-2xl bg-slate-900" />
              {!scanning && (
                <button onClick={startScanning} className="mt-4 w-full rounded-xl bg-primary py-3 text-xs font-bold text-white">
                  Start camera scan
                </button>
              )}
              {cameraError && <p className="mt-3 text-xs text-primary">{cameraError}</p>}
              <div className="mt-5 border-t border-border-subtle pt-4">
                <p className="mb-2 text-xs font-semibold text-muted">Camera denied? Paste the QR token manually:</p>
                <div className="flex gap-2">
                  <input
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    placeholder="Scanned token"
                    className="flex-1 rounded-xl border border-border-subtle px-3 py-2 text-xs"
                  />
                  <button onClick={() => handleToken(manualToken)} disabled={busy || !manualToken} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40">
                    Submit
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-bold text-ink">Result</h3>
          {busy ? (
            <p className="text-sm text-muted">Checking QR code...</p>
          ) : !result ? (
            <p className="text-sm text-muted">Scan a QR code to see the result here.</p>
          ) : result.ok ? (
            <div className={`rounded-2xl p-4 text-sm ${result.code === "already_checked_out" ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>
              <b className="block">{result.message}</b>
              {result.student && <p className="mt-2 text-xs">{result.student.displayName || result.student.email}</p>}
              {result.code === "checked_out" && typeof result.durationMinutes === "number" && (
                <p className="mt-1 text-xs font-semibold">Session length: {Math.floor(result.durationMinutes / 60)}h {result.durationMinutes % 60}m</p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-active p-4 text-sm text-primary">
              <b className="block">Unable to record attendance</b>
              <p className="mt-1 text-xs">{result.message}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
