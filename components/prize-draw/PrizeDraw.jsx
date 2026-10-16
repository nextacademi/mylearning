"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2, Maximize2, Minimize2, RotateCcw, Settings2, UserX, Volume2, VolumeX } from "lucide-react";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import { loadPrizeDrawSources, loadPrizePool } from "../../lib/services/prize-draw-service";
import { randomIndex } from "./effects";
import DrawOverlay from "./DrawOverlay";
import PrizeConfigModal, { SUSPENSE } from "./PrizeConfigModal";

// Saved on this device only, so a page refresh in the middle of a live draw
// keeps the prizes, the chosen pool and everyone already drawn.
const STORAGE_KEY = "prize-draw:v1";
const DEFAULT_CONFIG = {
  prizes: [
    { id: "power_bank", icon: "🔋", name: "Power Banks", allocation: 5 },
    { id: "gift_card", icon: "🎁", name: "Gift Cards", allocation: 5 },
    { id: "mystery_box", icon: "📦", name: "Mystery Boxes", allocation: 10 },
  ],
  pool: { type: "all" },
  suspense: "medium",
};

function loadSaved() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.config?.prizes?.length && saved.config.pool?.type) {
      return { config: { ...DEFAULT_CONFIG, ...saved.config }, winners: saved.winners || {}, muted: Boolean(saved.muted) };
    }
  } catch {
    // unreadable or blocked storage — start fresh
  }
  return { config: DEFAULT_CONFIG, winners: {}, muted: false };
}

const poolKey = (pool) => `${pool.type}:${pool.id || ""}:${pool.presentOnly ? 1 : 0}`;
const poolLabel = (pool) => (pool.type === "all" ? "All students" : `${pool.label || pool.id}${pool.presentOnly ? " (checked in)" : ""}`);

function PrizeCard({ prize, entries, disabled, onDraw, onMarkAbsent }) {
  const valid = entries.filter((entry) => !entry.absent);
  const remaining = Math.max(0, prize.allocation - valid.length);
  const extra = Math.max(0, valid.length - prize.allocation);
  const done = valid.length >= prize.allocation;
  return (
    <article className={`flex flex-col rounded-3xl border p-5 backdrop-blur transition ${done ? "border-emerald-400/30 bg-emerald-400/[0.06]" : "border-white/10 bg-white/[0.06] hover:border-white/20"}`}>
      <div className="text-5xl leading-none" aria-hidden="true">{prize.icon}</div>
      <h3 className="mt-3 text-lg font-black text-white">{prize.name}</h3>
      <p className="text-xs font-semibold text-white/50">{prize.allocation} winner{prize.allocation === 1 ? "" : "s"}</p>
      <p className="mt-4 flex items-baseline gap-1.5">
        <span className="text-5xl font-black tabular-nums text-white">{valid.length}</span>
        <span className="text-lg font-bold text-white/40">/ {prize.allocation}</span>
        {extra > 0 && <span className="ml-1 rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-bold text-amber-200">+{extra} extra</span>}
      </p>
      <button
        type="button"
        onClick={onDraw}
        disabled={disabled}
        className="mt-4 rounded-2xl bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400 px-4 py-3 text-sm font-black text-white shadow-lg shadow-rose-900/40 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {valid.length === 0 ? "Draw first winner" : !done ? `Draw next (${remaining} to go)` : "Draw one more"}
      </button>
      {entries.length > 0 && (
        <ol className="mt-4 space-y-1 border-t border-white/10 pt-3 text-sm">
          {entries.map((entry, index) => (
            <li key={`${entry.id}-${index}`} className="group flex items-center gap-2">
              <span className="w-5 text-right text-xs font-bold text-white/40">{index + 1}.</span>
              <span className={`min-w-0 flex-1 truncate font-semibold ${entry.absent ? "text-white/35 line-through" : "text-white"}`} title={entry.email || entry.name}>{entry.name}</span>
              {entry.absent ? (
                <span className="text-[10px] font-bold uppercase text-white/35">absent</span>
              ) : (
                <button type="button" onClick={() => onMarkAbsent(index)} className="rounded p-1 text-white/30 opacity-0 transition hover:bg-white/10 hover:text-white group-hover:opacity-100 focus:opacity-100" title="Not here — mark absent so you can draw again" aria-label={`Mark ${entry.name} absent`}>
                  <UserX className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

const headerButton = "inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/90 transition hover:bg-white/15 disabled:opacity-40";

export default function PrizeDraw() {
  const toast = useToast();
  const confirm = useConfirm();
  const stageRef = useRef(null);
  const drawCount = useRef(0);
  const [saved] = useState(loadSaved);
  const [config, setConfig] = useState(saved.config);
  const [winners, setWinners] = useState(saved.winners);
  const [muted, setMuted] = useState(saved.muted);
  const [sources, setSources] = useState(null);
  const [sourcesError, setSourcesError] = useState("");
  const [pool, setPoolResult] = useState({ key: "", members: [], error: "" });
  const [drawing, setDrawing] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [reducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const currentKey = poolKey(config.pool);
  const poolLoading = pool.key !== currentKey;
  const members = useMemo(() => (poolLoading ? [] : pool.members), [poolLoading, pool.members]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ config, winners, muted }));
    } catch {
      // storage unavailable — the draw still works for this session
    }
  }, [config, winners, muted]);

  useEffect(() => {
    let cancelled = false;
    loadPrizeDrawSources()
      .then((data) => { if (!cancelled) setSources(data); })
      .catch((err) => { if (!cancelled) setSourcesError(err.message || "Couldn't load events and trainings."); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const key = poolKey(config.pool);
    loadPrizePool(config.pool)
      .then((data) => { if (!cancelled) setPoolResult({ key, members: data.members || [], error: "" }); })
      .catch((err) => { if (!cancelled) setPoolResult({ key, members: [], error: err.message || "Couldn't load the draw pool." }); });
    return () => { cancelled = true; };
  }, [config.pool]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const drawnIds = useMemo(() => new Set(Object.values(winners).flat().map((entry) => entry.id)), [winners]);
  const eligible = useMemo(() => members.filter((person) => !drawnIds.has(person.id)), [members, drawnIds]);
  const cloudNames = useMemo(() => eligible.map((person) => person.name), [eligible]);
  const drawnCount = Object.values(winners).flat().filter((entry) => !entry.absent).length;

  function draw(prize) {
    if (drawing) return;
    if (!eligible.length) {
      toast.info("No one is left in the pool — everyone eligible has already been drawn.");
      return;
    }
    const winner = eligible[randomIndex(eligible.length)];
    setWinners((current) => ({ ...current, [prize.id]: [...(current[prize.id] || []), { ...winner, at: new Date().toISOString() }] }));
    drawCount.current += 1;
    setDrawing({ prize, winner, key: `${prize.id}-${winner.id}-${drawCount.current}` });
  }

  const closeOverlay = useCallback(() => setDrawing(null), []);

  function markAbsent(prizeId, index) {
    setWinners((current) => ({
      ...current,
      [prizeId]: current[prizeId].map((entry, i) => (i === index ? { ...entry, absent: true } : entry)),
    }));
  }

  async function saveConfig(next) {
    const poolChanged = poolKey(next.pool) !== poolKey(config.pool);
    const keptIds = new Set(next.prizes.map((prize) => prize.id));
    const droppedWithWinners = Object.keys(winners).filter((id) => !keptIds.has(id) && winners[id]?.length);
    if (drawnIds.size && (poolChanged || droppedWithWinners.length)) {
      const ok = await confirm({
        title: poolChanged ? "Change the draw pool?" : "Remove prizes with winners?",
        message: poolChanged
          ? "Changing who can win clears every winner drawn so far. Export the winners first if you need a record."
          : "Winners of the removed prizes will be cleared and go back into the pool.",
        tone: "danger",
        confirmLabel: "Continue",
      });
      if (!ok) return;
    }
    setConfig(next);
    setWinners((current) => (poolChanged ? {} : Object.fromEntries(Object.entries(current).filter(([id]) => keptIds.has(id)))));
    setConfigOpen(false);
  }

  function resetWinners() {
    return confirm({
      title: "Start a new draw?",
      message: "This clears every winner drawn so far and puts everyone back in the pool. Prizes and pool stay as they are.",
      tone: "danger",
      confirmLabel: "Clear winners",
      onConfirm: () => setWinners({}),
    });
  }

  function exportWinners() {
    const cell = (value) => {
      const text = String(value ?? "");
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const lines = [["prize", "number", "name", "email", "status", "drawn_at"].join(",")];
    config.prizes.forEach((prize) => (winners[prize.id] || []).forEach((entry, index) => {
      lines.push([prize.name, index + 1, entry.name, entry.email, entry.absent ? "absent" : "winner", entry.at].map(cell).join(","));
    }));
    const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prize-draw-winners-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      toast.warning("Full screen isn't available in this browser.");
    }
  }

  const durationMs = reducedMotion ? 1500 : (SUSPENSE.find(([key]) => key === config.suspense) || SUSPENSE[1])[2];
  const label = poolLabel(config.pool);

  return (
    <div
      ref={stageRef}
      className={`prize-stage relative isolate overflow-hidden bg-[#0b0b14] text-white ${fullscreen ? "h-screen overflow-y-auto p-6 md:p-10" : "min-h-[calc(100vh-10rem)] rounded-3xl p-5 md:p-8"}`}
    >
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
        <div className="prize-orb absolute -left-24 -top-24 h-96 w-96 rounded-full bg-rose-600/30 blur-3xl" />
        <div className="prize-orb absolute -right-24 top-1/3 h-96 w-96 rounded-full bg-purple-600/25 blur-3xl [animation-delay:-6s]" />
        <div className="prize-orb absolute -bottom-32 left-1/3 h-96 w-96 rounded-full bg-orange-500/20 blur-3xl [animation-delay:-12s]" />
      </div>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black tracking-tight md:text-xl">Launcher · Prize Draw <span aria-hidden="true">🎉</span></h2>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setConfigOpen(true)} className={headerButton}><Settings2 className="h-3.5 w-3.5" />Prizes &amp; pool</button>
          <button type="button" onClick={exportWinners} disabled={!drawnIds.size} className={headerButton}><Download className="h-3.5 w-3.5" />Winners CSV</button>
          <button type="button" onClick={resetWinners} disabled={!drawnIds.size} className={headerButton}><RotateCcw className="h-3.5 w-3.5" />New draw</button>
          <button type="button" onClick={() => setMuted((value) => !value)} className={headerButton} aria-pressed={muted} aria-label={muted ? "Turn sound on" : "Mute sound"}>
            {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={toggleFullscreen} className={headerButton}>
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}{fullscreen ? "Exit" : "Present"}
          </button>
        </div>
      </header>

      <section className="py-10 text-center md:py-14">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/60 md:text-sm">
          {config.pool.type === "all" ? "Students at Next Academy" : `Registered for ${label}`}
        </p>
        <p className="mt-2 bg-gradient-to-b from-white to-white/60 bg-clip-text text-7xl font-black tabular-nums text-transparent md:text-9xl">
          {poolLoading ? <Loader2 className="mx-auto h-16 w-16 animate-spin text-white/60" aria-label="Loading pool" /> : members.length.toLocaleString()}
        </p>
        <p className="mt-2 text-sm text-white/70 md:text-base">
          {pool.error && !poolLoading ? <span className="text-rose-300">{pool.error}</span>
            : !poolLoading && !members.length ? (
              <>No one in this pool yet. <button type="button" onClick={() => setConfigOpen(true)} className="ml-1 font-bold text-amber-200 underline">Change pool</button></>
            ) : "…and counting. Let’s pick some winners."}
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {config.prizes.map((prize) => (
          <PrizeCard
            key={prize.id}
            prize={prize}
            entries={winners[prize.id] || []}
            disabled={Boolean(drawing) || poolLoading || !eligible.length}
            onDraw={() => draw(prize)}
            onMarkAbsent={(index) => markAbsent(prize.id, index)}
          />
        ))}
      </section>

      <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-white/60">
        <span>Pool: <b className="text-white">{label}</b></span>
        <span aria-hidden="true">·</span>
        <span>Remaining: <b className="text-white">{poolLoading ? "…" : eligible.length}</b></span>
        <span aria-hidden="true">·</span>
        <span>Drawn: <b className="text-white">{drawnCount}</b></span>
      </footer>

      {drawing && (
        <DrawOverlay
          key={drawing.key}
          winner={drawing.winner}
          prize={drawing.prize}
          names={cloudNames.length ? cloudNames : [drawing.winner.name]}
          durationMs={durationMs}
          muted={muted}
          reducedMotion={reducedMotion}
          onClose={closeOverlay}
        />
      )}
      {configOpen && (
        <PrizeConfigModal config={config} sources={sources} sourcesError={sourcesError} onSave={saveConfig} onClose={() => setConfigOpen(false)} />
      )}
    </div>
  );
}
