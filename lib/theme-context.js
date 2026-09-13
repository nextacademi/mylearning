"use client";

import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({ dark: false, toggleTheme: () => {} });

// Site-wide light/dark toggle — persisted under the same localStorage key
// the Settings page already used before this became global, so an existing
// user's preference carries over unchanged. Applies `data-theme="dark"` to
// <html> (not a class on some inner wrapper), which is what lets
// app/globals.css's `:root[data-theme="dark"]` block reach every route,
// not just the Settings page.
export function ThemeProvider({ children }) {
  // Lazy initializer (not an effect) — reads localStorage synchronously on
  // first render, guarded for SSR where `window` doesn't exist yet. Next.js
  // renders this on the server first, so the very first paint is always
  // light; the real value applies before the user sees anything meaningful
  // since this runs during the initial client render, not after a mount
  // round-trip.
  const [dark, setDark] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("settings-theme") === "dark";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }, [dark]);

  function toggleTheme() {
    setDark((current) => {
      const next = !current;
      try {
        window.localStorage.setItem("settings-theme", next ? "dark" : "light");
      } catch {
        // ignore — in-memory only for this session
      }
      return next;
    });
  }

  return <ThemeContext.Provider value={{ dark, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
