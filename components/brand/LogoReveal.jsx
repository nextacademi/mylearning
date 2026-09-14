"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import ParticleText from "./ParticleText";

// Bump this if the reveal itself changes enough to be worth re-showing to
// returning visitors within the same tab session.
const SESSION_KEY = "nextacademy:logoReveal:v1";

export const BRAND_WORDS = [
  { text: "NEXT", color: "#ffffff" },
  { text: "ACADEMY", color: "#ff3b3b" },
];

// A once-per-session, full-screen cinematic reveal for the "Next Academy"
// wordmark: dark red/black gradient -> the logo mark fades up -> it
// dissolves into a swarm of small rectangular particles that fly in and
// resolve into the "NEXT ACADEMY" wordmark -> a brief glowing hold -> fade
// out to the real homepage underneath (which is already mounted behind it,
// so there's no extra load delay). ~5.3s end-to-end on a full-motion
// device; ~2s of plain crossfades under prefers-reduced-motion (see
// ParticleText, which is the component that actually drops the particle
// swarm for reduced motion).
export default function LogoReveal({ force = false, onComplete }) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState("mark"); // mark -> text -> fade -> (unmounted)

  useEffect(() => {
    if (!force) {
      try {
        if (sessionStorage.getItem(SESSION_KEY)) {
          // One-time sync from external state (sessionStorage), not a
          // cascading update — the reveal has already played this session,
          // so skip straight to "done" instead of flashing the mark phase.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setPhase("done");
          onComplete?.();
          return undefined;
        }
      } catch {
        // sessionStorage unavailable (privacy mode, etc.) — just play it.
      }
    }

    const timers = [];
    const schedule = (fn, ms) => timers.push(setTimeout(fn, ms));

    if (reducedMotion) {
      schedule(() => setPhase("text"), 200);
      schedule(() => setPhase("fade"), 1500);
      schedule(finish, 2100);
    } else {
      schedule(() => setPhase("text"), 1750);
      schedule(() => setPhase("fade"), 5000);
      schedule(finish, 5600);
    }

    function finish() {
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // ignore — worst case it plays again next time.
      }
      setPhase("done");
      onComplete?.();
    }

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [force, reducedMotion]);

  if (phase === "done") return null;

  return (
    <AnimatePresence>
      {phase !== "done" && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-black"
          initial={{ opacity: 1 }}
          animate={{ opacity: phase === "fade" ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: "easeInOut" }}
          aria-hidden="true"
        >
          {/* Cinematic dark red/black gradient backdrop + soft depth glow. */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,45,45,0.22),transparent_60%),linear-gradient(180deg,#050505_0%,#0c0405_55%,#000000_100%)]" />
          <motion.div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[60vmin] w-[60vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#ff2d2d]/25 blur-[110px]"
            animate={reducedMotion ? {} : { opacity: [0.5, 0.85, 0.6], scale: [1, 1.08, 1] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
          />
          {/* Brief grid flicker as the mark hands off to the particle swarm — the "grid transition" beat. */}
          {phase === "text" && !reducedMotion && (
            <motion.div
              className="pointer-events-none absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.5)_1px,transparent_1px)] [background-size:34px_34px]"
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            />
          )}

          <AnimatePresence mode="wait">
            {phase === "mark" && (
              <motion.div
                key="mark"
                className="relative flex flex-col items-center gap-4 px-6"
                initial={{ opacity: 0, scale: 0.85, filter: "blur(10px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 1.1, filter: "blur(16px)" }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo.jpeg"
                  alt=""
                  className="h-16 w-16 rounded-[14px_14px_14px_4px] object-contain shadow-[0_0_40px_rgba(255,45,45,0.55)] sm:h-20 sm:w-20"
                />
                <p className="text-center text-xl font-black tracking-[0.2em] text-white sm:text-2xl">
                  NEXT<span className="text-[#ff3b3b]"> ACADEMY</span>
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {phase === "text" && (
            <motion.div
              className="relative flex w-full flex-col items-center px-6"
              initial={{ opacity: reducedMotion ? 0 : 1 }}
              animate={{
                opacity: 1,
                filter: reducedMotion ? "none" : ["drop-shadow(0 0 0px rgba(255,59,59,0))", "drop-shadow(0 0 28px rgba(255,59,59,0.45))", "drop-shadow(0 0 14px rgba(255,59,59,0.3))"],
              }}
              transition={{ duration: 2.4, ease: "easeOut" }}
            >
              <div className="relative h-[46vw] max-h-[280px] min-h-[150px] w-[80vw] max-w-[560px]">
                {/* The particle swarm is a flourish, not the actual payoff —
                    a few hundred small dashes approximating letterforms
                    reads as noise at a glance, no matter how well they're
                    laid out. It dims once the particles have mostly
                    converged, handing off to real, always-crisp text
                    underneath (below) so the moment that holds on screen
                    longest is guaranteed legible. */}
                <motion.div
                  className="absolute inset-0"
                  animate={reducedMotion ? {} : { opacity: [1, 1, 0.3] }}
                  transition={{ duration: 1.8, times: [0, 0.5, 1], ease: "easeOut" }}
                >
                  <ParticleText
                    words={BRAND_WORDS}
                    accentColor="#ff3b3b"
                    accentRatio={0.08}
                    seed={7}
                    stacked
                    play={!reducedMotion}
                    className="h-full w-full"
                  />
                </motion.div>
                {!reducedMotion && (
                  <motion.p
                    className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center font-black leading-[1.15] tracking-[0.04em]"
                    style={{ fontSize: "min(9vw, 56px)" }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.9, duration: 0.5, ease: "easeOut" }}
                  >
                    <span className="block text-white">NEXT</span>
                    <span className="block text-[#ff3b3b]">ACADEMY</span>
                  </motion.p>
                )}
              </div>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
