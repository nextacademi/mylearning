"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { manageSessionQr } from "../../lib/class-sessions-data";

// The teacher-facing side of the automatic QR attendance system: displays
// a live, rotating, signed QR for one real Class Session so students can
// self-check-in by scanning it (see app/api/attendance/session-checkin).
// The teacher never marks students individually — they only start/stop
// this display. Uses the same `qrcode` package + toDataURL call already
// used for the D Card QR in components/teacher/IdCardPrint.jsx.
export default function SessionQrDialog({ session, onClose }) {
  const [qrImage, setQrImage] = useState("");
  const [expiresAt, setExpiresAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [stopped, setStopped] = useState(false);
  const startedRef = useRef(false);

  async function issue(action) {
    try {
      const response = await manageSessionQr(session.id, action);
      setExpiresAt(response.expiresAt);
      const dataUrl = await QRCode.toDataURL(response.token, { margin: 1, width: 260 });
      setQrImage(dataUrl);
      setError("");
    } catch (err) {
      setError(err.message || "Unable to start the attendance QR.");
    }
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    issue("start");
    // Stop the live session if the teacher navigates away/closes without
    // clicking Stop explicitly — never leave a QR silently active.
    return () => {
      manageSessionQr(session.id, "stop").catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Auto-refresh a few seconds before the current token expires, so the
  // displayed QR rotates on its own without the teacher doing anything.
  useEffect(() => {
    if (!expiresAt || stopped) return undefined;
    const msLeft = expiresAt - Date.now();
    const timer = setTimeout(() => issue("refresh"), Math.max(1000, msLeft - 5000));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, stopped]);

  async function handleStop() {
    setStopped(true);
    try {
      await manageSessionQr(session.id, "stop");
    } catch {
      // Non-fatal — the dialog is closing either way.
    }
    onClose();
  }

  const secondsLeft = Math.max(0, Math.ceil((expiresAt - now) / 1000));

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-3xl bg-card p-6 text-center shadow-2xl">
        <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Attendance QR</p>
        <h3 className="mt-1 text-lg font-black text-ink">{session.title}</h3>
        <p className="mt-1 text-xs text-muted">{session.date}{session.startTime ? ` · ${session.startTime}–${session.endTime}` : ""}{session.location ? ` · ${session.location}` : ""}</p>

        {error ? (
          <p className="mt-6 rounded-xl bg-active p-4 text-sm text-primary">{error}</p>
        ) : qrImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrImage} alt="Attendance QR code" className="mx-auto mt-5 h-56 w-56 rounded-2xl border border-border-subtle" />
            <p className="mt-3 text-xs font-bold text-muted">QR refreshes in <span className="text-primary">{secondsLeft}s</span></p>
            <p className="mt-1 text-[11px] text-subtle">Students scan this from their own QR Scanner to check in.</p>
          </>
        ) : (
          <p className="mt-6 text-sm text-muted">Starting attendance QR...</p>
        )}

        <button type="button" onClick={handleStop} className="mt-6 w-full rounded-xl bg-primary py-2.5 text-sm font-bold text-white">
          Stop Attendance QR
        </button>
      </div>
    </div>
  );
}
