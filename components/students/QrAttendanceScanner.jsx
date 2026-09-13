"use client";

import { useEffect, useRef, useState } from "react";
import { QrCode, ShieldAlert, CheckCircle2, Clock } from "lucide-react";
import { checkInSession } from "../../lib/services/qr-service";

const SCANNER_ELEMENT_ID = "student-attendance-qr-scanner";

// The student-facing half of the automatic QR attendance system: the
// teacher/session displays a live QR (SessionQrDialog); the student scans
// it here and the server (app/api/attendance/session-checkin) does every
// bit of the real validation — this component only ever reports what the
// server decided, it never marks attendance itself. Uses the exact same
// `html5-qrcode` camera lifecycle already used by Teacher's own
// ScanQrView, so there is one scanning mechanism in the app, not two.
export default function QrAttendanceScanner() {
  const [scanning, setScanning] = useState(false);
  const [manualToken, setManualToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const scannerRef = useRef(null);

  async function handleToken(token) {
    if (!token || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await checkInSession(token);
      setResult(response);
    } catch (error) {
      setResult({ code: "error", message: error.message || "Unable to check in right now. Please try again." });
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
          ? "Camera permission was denied. Please allow camera access, or use manual entry below."
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
    <div className="space-y-6">
      <section className="rounded-3xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-6 shadow-xl">
        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Attendance</p>
        <h2 className="mt-2 text-3xl font-black text-ink">QR Attendance</h2>
        <p className="mt-2 text-sm text-muted">Scan the QR code displayed for today&apos;s active class to check yourself in.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_.8fr]">
        <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
          <div className="mb-4 flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" aria-hidden="true" />
            <b className="text-sm text-ink">Camera Scanner</b>
          </div>
          <div id={SCANNER_ELEMENT_ID} className="mx-auto max-w-sm overflow-hidden rounded-2xl bg-slate-900" />
          {!scanning && (
            <button type="button" onClick={startScanning} className="mt-4 w-full rounded-xl bg-primary py-3 text-xs font-bold text-white">
              Scan QR Code
            </button>
          )}
          {cameraError && <p className="mt-3 text-xs text-primary">{cameraError}</p>}
          <div className="mt-5 border-t border-border-subtle pt-4">
            <p className="mb-2 text-xs font-semibold text-muted">Camera not working? Paste the scanned code manually:</p>
            <div className="flex gap-2">
              <input
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Scanned token"
                className="flex-1 rounded-xl border border-border-subtle px-3 py-2 text-xs"
              />
              <button
                type="button"
                onClick={() => handleToken(manualToken)}
                disabled={busy || !manualToken}
                className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                Submit
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
          <b className="mb-3 block text-sm text-ink">Result</b>
          {busy ? (
            <p className="text-sm text-muted">Checking you in...</p>
          ) : !result ? (
            <p className="text-sm text-muted">Scan the class QR code to see your attendance result here.</p>
          ) : result.code === "checked_in" ? (
            <ResultCard tone="success" icon={CheckCircle2} title="Attendance Marked">
              <Field label="Course" value={result.course?.title} />
              <Field label="Session" value={result.session?.title} />
              <Field label="Status" value="Present" />
              <Field label="Time" value={new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })} />
            </ResultCard>
          ) : result.code === "checked_out" ? (
            <ResultCard tone="success" icon={CheckCircle2} title="Checked Out">
              <Field label="Course" value={result.course?.title} />
              <Field label="Session" value={result.session?.title} />
              {typeof result.durationMinutes === "number" && <Field label="Duration" value={`${result.durationMinutes} min`} />}
            </ResultCard>
          ) : result.code === "already_checked_out" ? (
            <ResultCard tone="warning" icon={Clock} title="Already Marked">
              You are already marked present for this session.
            </ResultCard>
          ) : result.code === "not_enrolled" ? (
            <ResultCard tone="danger" icon={ShieldAlert} title="Not Enrolled">
              You are not enrolled in this class.
            </ResultCard>
          ) : result.code === "expired" ? (
            <ResultCard tone="danger" icon={ShieldAlert} title="QR Expired">
              Please scan the currently active class QR code.
            </ResultCard>
          ) : result.code === "no_session" ? (
            <ResultCard tone="danger" icon={ShieldAlert} title="No Active Session">
              There is currently no attendance session available.
            </ResultCard>
          ) : (
            <ResultCard tone="danger" icon={ShieldAlert} title="Invalid QR Code">
              {result.message || "This QR code could not be recognized."}
            </ResultCard>
          )}
        </section>
      </div>
    </div>
  );
}

function ResultCard({ tone, icon: Icon, title, children }) {
  const tones = {
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
    danger: "bg-active text-primary",
  };
  return (
    <div className={`rounded-2xl p-4 text-sm ${tones[tone]}`}>
      <div className="flex items-center gap-2 font-black">
        <Icon className="h-5 w-5" aria-hidden="true" />
        {title}
      </div>
      <div className="mt-2 space-y-1 text-xs text-ink">{children}</div>
    </div>
  );
}

function Field({ label, value }) {
  if (!value) return null;
  return (
    <p>
      <span className="font-bold text-muted">{label}: </span>
      {value}
    </p>
  );
}
