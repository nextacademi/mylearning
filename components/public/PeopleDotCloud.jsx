// A circular cloud of small person-icon dots — an ORIGINAL implementation of
// the visual concept (not a copy of any external site's image asset).
// Positions use a sunflower/Fibonacci-spiral distribution for an even,
// natural-looking fill, and colors are picked with a seeded PRNG (not
// Math.random()) so server and client render identically — avoiding a
// hydration mismatch, since this is plain SVG with no client-only state.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Deterministic, seeded pseudo-random (mulberry32) — same output every
// render, on server and client alike.
function seededRandom(seed) {
  let t = seed;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Fixed-precision string, not a raw float — Node's and Chrome's V8 builds
// occasionally differ in the very last digit of a long floating-point
// number's shortest-round-trip string (both are spec-compliant; the
// intermediate double just isn't always represented identically), which
// React's hydration check treats as a real mismatch. Rounding to 2 decimals
// keeps the visual precision (a fraction of a pixel) while making the
// server- and client-rendered strings byte-identical.
const fixed = (n) => Math.round(n * 100) / 100;

function PersonDot({ x, y, size, color }) {
  return (
    <g transform={`translate(${fixed(x)}, ${fixed(y)})`}>
      <circle cx="0" cy={fixed(-size * 0.55)} r={fixed(size * 0.32)} fill={color} />
      <path
        d={`M ${fixed(-size * 0.42)} ${fixed(size * 0.5)} Q ${fixed(-size * 0.42)} ${fixed(-size * 0.05)} 0 ${fixed(-size * 0.05)} Q ${fixed(size * 0.42)} ${fixed(-size * 0.05)} ${fixed(size * 0.42)} ${fixed(size * 0.5)} Z`}
        fill={color}
      />
    </g>
  );
}

export default function PeopleDotCloud({ count = 170, size = 340, className = "" }) {
  const random = seededRandom(20260914);
  const radius = size / 2;
  const dots = Array.from({ length: count }, (_, i) => {
    const r = radius * Math.sqrt((i + 0.5) / count);
    const theta = i * GOLDEN_ANGLE;
    const x = radius + r * Math.cos(theta);
    const y = radius + r * Math.sin(theta);
    const roll = random();
    const color = roll < 0.16 ? "#EF4444" : roll < 0.32 ? "#FCA5A5" : roll < 0.55 ? "#E5E7EB" : "#F3F4F6";
    const dotSize = 9 + random() * 5;
    return { x, y, color, dotSize, key: i };
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="Illustration representing our growing community"
    >
      <circle cx={radius} cy={radius} r={radius} fill="none" />
      {dots.map((dot) => (
        <PersonDot key={dot.key} x={dot.x} y={dot.y} size={dot.dotSize} color={dot.color} />
      ))}
    </svg>
  );
}
