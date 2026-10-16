"use client";

// Sound + confetti for the Prize Draw reveal. Everything is generated in the
// browser (Web Audio oscillators, a canvas) — no audio or image assets.

let audioContext = null;
function audio() {
  if (typeof window === "undefined") return null;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  if (!audioContext) audioContext = new Context();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function tick(ctx, volume, frequency) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "square";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.07);
}

// A roulette-style ticking that slows down over `durationMs`. Returns a stop function.
export function startTicking(durationMs) {
  const ctx = audio();
  if (!ctx) return () => {};
  let stopped = false;
  let timer = null;
  const started = performance.now();
  const step = () => {
    if (stopped) return;
    const progress = (performance.now() - started) / durationMs;
    if (progress >= 1) return;
    tick(ctx, 0.12, 800 - progress * 300);
    timer = setTimeout(step, (0.04 + progress ** 1.6 * 0.31) * 1000);
  };
  step();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

export function playFanfare() {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    const at = now + index * 0.08;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.16, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 1.8);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + 1.9);
  });
  const boom = ctx.createOscillator();
  const boomGain = ctx.createGain();
  boom.type = "sine";
  boom.frequency.setValueAtTime(120, now);
  boom.frequency.exponentialRampToValueAtTime(40, now + 0.6);
  boomGain.gain.setValueAtTime(0.4, now);
  boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
  boom.connect(boomGain);
  boomGain.connect(ctx.destination);
  boom.start(now);
  boom.stop(now + 0.75);
}

const CONFETTI_COLORS = ["#ffd700", "#f97316", "#e11d48", "#a855f7", "#38bdf8", "#ffffff"];

// One confetti burst from (x, y) as fractions of `host`. The canvas lives
// inside `host` so it also shows when the stage is in full-screen mode.
export function burstConfetti(host, { x = 0.5, y = 0.5, count = 200 } = {}) {
  if (!host) return;
  const canvas = document.createElement("canvas");
  const width = host.clientWidth;
  const height = host.clientHeight;
  canvas.width = width;
  canvas.height = height;
  canvas.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:5";
  host.appendChild(canvas);
  const context = canvas.getContext("2d");
  const pieces = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 14;
    return {
      x: width * x, y: height * y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - Math.random() * 6,
      gravity: 0.18 + Math.random() * 0.1, rotation: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 0.4,
      size: 6 + Math.random() * 8, color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      life: 0, maxLife: 90 + Math.random() * 60,
    };
  });
  const frame = () => {
    context.clearRect(0, 0, width, height);
    let alive = 0;
    for (const piece of pieces) {
      if (piece.life >= piece.maxLife) continue;
      alive += 1;
      piece.life += 1;
      piece.vy += piece.gravity;
      piece.vx *= 0.995;
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.rotation += piece.spin;
      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.rotation);
      context.globalAlpha = Math.max(0, 1 - piece.life / piece.maxLife);
      context.fillStyle = piece.color;
      context.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size * 0.5);
      context.restore();
    }
    if (alive) requestAnimationFrame(frame);
    else canvas.remove();
  };
  frame();
}

// Unbiased random index using the browser's cryptographic RNG.
export function randomIndex(length) {
  if (length <= 1) return 0;
  const limit = Math.floor(0x100000000 / length) * length;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % length;
}
