"use client";

import { useEffect, useRef, useState } from "react";

// A card held up to the camera is decoded ~10 times a second, and it is
// usually still in frame after its result comes back. The same code only
// counts again once it has been out of view this long — re-reading a
// checked-in student would otherwise check them straight back out.
const SAME_CODE_GAP_MS = 3000;

// html5-qrcode's stop() throws synchronously when the camera isn't running.
function stopCamera(scanner) {
  try {
    return Promise.resolve(scanner?.stop()).catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

// Continuous html5-qrcode camera scanning: the camera stays on after each
// read so a line of ID cards can be scanned one after another without
// pressing Start again. `onScan` may be async; reads arriving while it is
// still running are dropped, and the latest `onScan` is always the one
// called, so a class/session picked mid-scan applies to the next card.
export function useQrScanner(elementId, onScan) {
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const scannerRef = useRef(null);
  const startingRef = useRef(false);
  const handlingRef = useRef(false);
  const lastRef = useRef({ text: "", seenAt: 0 });
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  });

  function handleDecoded(text) {
    const now = Date.now();
    const last = lastRef.current;
    if (text === last.text) {
      const gap = now - last.seenAt;
      last.seenAt = now;
      if (gap < SAME_CODE_GAP_MS) return;
    }
    if (handlingRef.current) return;
    lastRef.current = { text, seenAt: now };
    handlingRef.current = true;
    Promise.resolve()
      .then(() => onScanRef.current(text))
      .catch(() => {})
      .finally(() => {
        handlingRef.current = false;
      });
  }

  async function start() {
    if (scannerRef.current || startingRef.current) return;
    startingRef.current = true;
    setCameraError("");
    lastRef.current = { text: "", seenAt: 0 };
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(elementId);
      scannerRef.current = scanner;
      await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 220 }, handleDecoded, () => {});
      // Stopped (or unmounted) while the camera was still starting up.
      if (scannerRef.current !== scanner) {
        stopCamera(scanner);
        return;
      }
      setScanning(true);
    } catch (error) {
      scannerRef.current = null;
      setCameraError(
        String(error?.message || error).includes("Permission")
          ? "Camera permission was denied. Use manual entry below instead."
          : "Unable to access the camera. Use manual entry below instead.",
      );
    } finally {
      startingRef.current = false;
    }
  }

  function stop() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setScanning(false);
    return stopCamera(scanner);
  }

  useEffect(
    () => () => {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      stopCamera(scanner);
    },
    [],
  );

  return { scanning, cameraError, start, stop };
}
