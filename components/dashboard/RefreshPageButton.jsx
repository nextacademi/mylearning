"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

// Header "Refresh" — reloads the current page's data only (see
// lib/page-refresh.js), never the whole app.
export default function RefreshPageButton({ onRefresh }) {
  const [spinning, setSpinning] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        setSpinning(true);
        onRefresh?.();
        setTimeout(() => setSpinning(false), 700);
      }}
      className="rounded-xl p-2.5 text-muted transition hover:bg-page hover:text-primary"
      aria-label="Refresh this page"
      title="Refresh this page's data"
    >
      <RefreshCw className={`h-5 w-5 ${spinning ? "animate-spin" : ""}`} aria-hidden="true" />
    </button>
  );
}
