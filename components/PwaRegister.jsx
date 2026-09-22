"use client";

import { useEffect } from "react";

const RELOADED_FLAG = "sw-auto-reloaded";

// Mounted once from the root layout so the app is installable from any
// page, not just Settings — the Settings page's "Install App" button
// listens for the browser's own beforeinstallprompt event separately.
//
// Also self-heals a browser stuck on an OLDER, previously-caching version
// of public/sw.js: `registration.update()` forces an immediate byte
// comparison against the current script (browsers otherwise only check
// periodically), and once the new worker activates and takes control, the
// page reloads itself once so any stale content that older worker served
// is replaced with a real network fetch — no manual DevTools steps needed.
// sessionStorage guards against a reload loop if `controllerchange` were
// ever to fire more than once in the same tab.
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => registration.update().catch(() => {}))
      .catch(() => {});

    function onControllerChange() {
      if (sessionStorage.getItem(RELOADED_FLAG)) return;
      sessionStorage.setItem(RELOADED_FLAG, "1");
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);
  return null;
}
