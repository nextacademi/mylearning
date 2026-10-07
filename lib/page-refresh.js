import { useCallback, useState } from "react";

// Per-page "Refresh" (the button in every dashboard header). A browser
// reload restarts the whole app — splash screen, auth, profile, every
// prefetch — just to see new data on one page. This instead:
//   1. drops every cached API response (each cached loader registers its
//      own reset below), so nothing is served stale, then
//   2. remounts ONLY the page content under the header (the shells key
//      their content wrapper on `refreshKey`), so that page's own
//      load-on-mount effects run again against the server.
// Sidebar, header, sign-in and the current module stay exactly as they are.
// Live Firestore listeners (chat, room booking, model tests, ...) need no
// reset — remounting simply re-subscribes them.
const resetters = new Set();

export function registerCacheReset(reset) {
  resetters.add(reset);
}

export function resetPageCaches() {
  resetters.forEach((reset) => {
    try {
      reset();
    } catch {
      // A reset only clears an in-memory variable — never let one bad
      // registration block the rest of the refresh.
    }
  });
}

export function usePageRefresh() {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => {
    resetPageCaches();
    setRefreshKey((key) => key + 1);
  }, []);
  return [refreshKey, refresh];
}

// Sub-tab state that survives a page Refresh (which remounts the page) and
// a full browser reload — otherwise refreshing on e.g. Finance → Income
// would drop you back on Finance → Dashboard. Per-tab-session only
// (sessionStorage), and every access is guarded: storage can be missing or
// throw (private mode, blocked site data), in which case this is a plain
// useState.
export function useSessionTab(storageKey, initial, allowed) {
  const [tab, setTabState] = useState(() => {
    try {
      const saved = typeof window !== "undefined" ? window.sessionStorage.getItem(`tab:${storageKey}`) : null;
      if (saved && (!allowed || allowed.includes(saved))) return saved;
    } catch {
      // fall through to the default
    }
    return initial;
  });
  const setTab = useCallback(
    (next) => {
      setTabState(next);
      try {
        window.sessionStorage.setItem(`tab:${storageKey}`, next);
      } catch {
        // storage unavailable — the tab still switches, it just won't persist
      }
    },
    [storageKey],
  );
  return [tab, setTab];
}
