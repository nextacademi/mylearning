"use client";

import { useEffect, useRef, useState } from "react";
import { burstConfetti, playFanfare, startTicking } from "./effects";

const NAME_LIFETIME = 2200;

// Full-screen moment for one draw: a drifting cloud of eligible names while
// the ticking slows down, then the winner's name with fanfare + confetti.
// Mounted with a fresh `key` per draw, so its state always starts at "spinning".
export default function DrawOverlay({ winner, prize, names, durationMs, muted, reducedMotion, onClose }) {
  const [phase, setPhase] = useState("spinning");
  const [cloud, setCloud] = useState([]);
  const hostRef = useRef(null);

  useEffect(() => {
    const timers = [];
    let running = true;
    let nextKey = 0;
    const stopTicking = muted ? () => {} : startTicking(durationMs);
    const started = performance.now();

    const spawn = () => {
      if (!running || reducedMotion || !names.length) return;
      const progress = (performance.now() - started) / durationMs;
      if (progress > 0.88) return;
      const entry = {
        key: (nextKey += 1),
        name: names[Math.floor(Math.random() * names.length)],
        x: 6 + Math.random() * 88,
        y: 14 + Math.random() * 72,
        scale: 0.7 + Math.random() * 1.3,
        rotate: -14 + Math.random() * 28,
        hue: Math.random() * 60 - 30,
      };
      setCloud((current) => [...current, entry]);
      timers.push(setTimeout(() => setCloud((current) => current.filter((item) => item.key !== entry.key)), NAME_LIFETIME));
      timers.push(setTimeout(spawn, 75 + progress ** 1.4 * 185));
    };
    spawn();

    timers.push(setTimeout(() => {
      running = false;
      setCloud([]);
      setPhase("revealed");
      if (!muted) playFanfare();
      if (!reducedMotion) {
        burstConfetti(hostRef.current);
        timers.push(setTimeout(() => burstConfetti(hostRef.current, { x: 0.22 }), 220));
        timers.push(setTimeout(() => burstConfetti(hostRef.current, { x: 0.78 }), 440));
      }
    }, durationMs));

    return () => {
      running = false;
      stopTicking();
      timers.forEach(clearTimeout);
    };
  }, [durationMs, muted, names, reducedMotion]);

  useEffect(() => {
    if (phase !== "revealed") return undefined;
    const onKey = (event) => { if (event.key === "Escape" || event.key === "Enter" || event.key === " ") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  return (
    <div
      ref={hostRef}
      className="fixed inset-0 z-[70] overflow-hidden bg-[radial-gradient(circle_at_50%_40%,#2a0f2e_0%,#0b0b14_65%)] text-white"
      onClick={phase === "revealed" ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={`Drawing ${prize.name}`}
    >
      <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-sm font-bold backdrop-blur">
        Drawing: {prize.icon} {prize.name}
      </div>

      {phase === "spinning" && (
        <div aria-hidden="true">
          {cloud.map((item) => (
            <div
              key={item.key}
              className="prize-cloud-name absolute whitespace-nowrap text-2xl font-black text-amber-200 drop-shadow-[0_0_18px_rgba(249,115,22,0.6)] md:text-4xl"
              style={{ left: `${item.x}%`, top: `${item.y}%`, transform: `translate(-50%, -50%) rotate(${item.rotate}deg) scale(${item.scale})`, filter: `hue-rotate(${item.hue}deg)` }}
            >
              {item.name}
            </div>
          ))}
          <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 items-center gap-2 text-sm font-semibold text-white/70">
            <span className="prize-dot h-2 w-2 rounded-full bg-rose-400" />
            <span className="prize-dot h-2 w-2 rounded-full bg-orange-400 [animation-delay:150ms]" />
            <span className="prize-dot h-2 w-2 rounded-full bg-purple-400 [animation-delay:300ms]" />
            Picking a winner…
          </div>
        </div>
      )}

      {phase === "revealed" && (
        <div className="prize-reveal absolute inset-0 grid place-items-center px-6 text-center" role="status" aria-live="assertive">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em] text-amber-200/80 md:text-base">And the winner is…</p>
            <p className="mt-4 bg-gradient-to-r from-amber-200 via-orange-300 to-rose-300 bg-clip-text text-5xl font-black leading-tight text-transparent md:text-8xl">
              {winner.name}
            </p>
            <p className="mt-6 text-lg font-bold text-white/90 md:text-2xl">{prize.icon} {prize.name}</p>
            <p className="mt-10 text-xs font-semibold uppercase tracking-widest text-white/50">Tap anywhere or press Enter to continue</p>
          </div>
        </div>
      )}
    </div>
  );
}
