"use client";

import { useSessionTab } from "../../lib/page-refresh";
import VolunteerHomePanel from "./VolunteerHomePanel";
import VolunteerLeaderConsole from "./VolunteerLeaderConsole";

const TABS = ["Overview", "My Panel"];

// Director/Admin sidebar "Volunteer": the organisation-wide leader console
// (Overview) and their own personal Volunteer Home Panel (My Panel).
export default function VolunteerModule({ name, onNavigate }) {
  const [tab, setTab] = useSessionTab("volunteer", "Overview", TABS);
  return (
    <div className="space-y-5">
      <nav className="flex w-fit gap-1 rounded-2xl border border-border-subtle bg-card p-1 shadow-sm">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-xl px-4 py-2 text-xs font-bold ${tab === item ? "bg-primary text-white" : "text-muted hover:bg-active"}`}
          >
            {item}
          </button>
        ))}
      </nav>
      {tab === "Overview" ? <VolunteerLeaderConsole name={name} onNavigate={onNavigate} /> : <VolunteerHomePanel />}
    </div>
  );
}
