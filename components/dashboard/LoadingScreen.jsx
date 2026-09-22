"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, LayoutDashboard, ShieldCheck, Sparkles } from "lucide-react";

// Purely a visual splash — it does not gate on or represent any real
// backend operation beyond the single `ready` flag the caller passes in
// (which mirrors the app's actual auth-loading state). The percentage/
// stage timeline below is a fixed, self-driven animation; it only ever
// waits on `ready` at the very end, so a genuinely slow auth resolution
// still shows a truthful "still loading" state instead of a fake 100%.
const steps = [
  { progress: 20, stage: "AUTH", icon: ShieldCheck, message: "Authenticating your account", subtitle: "Verifying secure academy session" },
  { progress: 50, stage: "COURSES", icon: BookOpen, message: "Loading courses", subtitle: "Syncing interactive components" },
  { progress: 80, stage: "STUDIO", icon: LayoutDashboard, message: "Preparing workspace", subtitle: "Setting up your dashboard" },
  { progress: 100, stage: "READY", icon: Sparkles, message: "Almost ready", subtitle: "Welcome back" },
];
const stageOrder = ["AUTH", "COURSES", "STUDIO", "READY"];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function LoadingScreen({ ready, onFinished }) {
  const [stepIndex, setStepIndex] = useState(0); // 0 = not yet reached the first checkpoint
  const [fading, setFading] = useState(false);
  const readyRef = useRef(ready);
  const [reducedMotion] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false,
  );

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Ramp through the first three checkpoints (20% / 50% / 80%) on a
      // fixed, short timeline regardless of real load speed — this is the
      // "polished" fixed-duration part of the experience. Reduced-motion
      // users skip straight to the final wait instead of watching the ramp.
      if (reducedMotion) {
        setStepIndex(3);
      } else {
        const rampDelays = [350, 500, 500];
        for (let i = 0; i < 3; i += 1) {
          await sleep(rampDelays[i]);
          if (cancelled) return;
          setStepIndex(i + 1);
        }
      }
      // Only the final jump to 100% waits on the real `ready` signal — if
      // auth genuinely takes longer, this holds at 80% truthfully instead
      // of claiming completion early.
      while (!readyRef.current) {
        await sleep(100);
        if (cancelled) return;
      }
      await sleep(reducedMotion ? 0 : 200);
      if (cancelled) return;
      setStepIndex(4);
      await sleep(reducedMotion ? 0 : 350);
      if (cancelled) return;
      setFading(true);
      await sleep(reducedMotion ? 0 : 500);
      if (cancelled) return;
      onFinished?.();
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = stepIndex === 0 ? steps[0] : steps[stepIndex - 1];
  const progress = stepIndex === 0 ? 0 : current.progress;
  const activeStageCount = Math.max(stepIndex, 1); // AUTH is active from the very start
  const completedStageCount = stepIndex; // a stage is "completed" once we've moved past it

  return (
    <div
      className={`fixed inset-0 z-[100] grid place-items-center bg-page p-4 transition-opacity duration-500 ${fading ? "pointer-events-none opacity-0" : "opacity-100"}`}
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-sm rounded-3xl border border-border-subtle bg-card p-8 text-center shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-card shadow-[0_8px_24px_rgba(255,45,45,0.18)]">
          <img src="/logo.jpeg" alt="Next Academy logo" className="h-12 w-12 rounded-xl object-contain" />
        </div>

        <h1 className="mt-5 text-lg font-bold text-ink">Preparing your dashboard</h1>
        <p className="mt-1 text-xs text-muted">{current.subtitle}</p>

        <div className="mt-6 flex items-center justify-between text-xs">
          <span className="font-semibold text-muted">{current.message}</span>
          <span className="font-bold text-primary">{progress}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full border border-border-subtle bg-[#E7E5E4]">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-6 flex items-center justify-between">
          {stageOrder.map((stage, index) => {
            const isCompleted = index < completedStageCount;
            const isActive = !isCompleted && index < activeStageCount;
            const Icon = steps[index].icon;
            const state = isCompleted ? "completed" : isActive ? "active" : "inactive";
            // Red throughout (this app's brand color) — "completed" is a
            // solid-red fill, "active" a lighter red tint, never green.
            const iconBg = state === "completed" ? "bg-primary" : state === "active" ? "bg-active" : "bg-transparent";
            const iconColor = state === "completed" ? "text-white" : state === "active" ? "text-primary" : "text-subtle";
            const labelColor = state === "inactive" ? "text-subtle" : "text-primary";
            return (
              <div key={stage} className="flex flex-1 flex-col items-center gap-1.5">
                <span
                  className={`grid h-9 w-9 place-items-center rounded-full ${iconBg} ${state === "active" && !reducedMotion ? "animate-pulse" : ""}`}
                >
                  <Icon className={`h-4 w-4 ${iconColor}`} aria-hidden="true" />
                </span>
                <span className={`text-[9px] font-bold uppercase tracking-wider ${labelColor}`}>{stage}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
