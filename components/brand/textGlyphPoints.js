"use client";

// Canvas-based text sampling used by ParticleText (the full-screen logo
// reveal) — measures where a word's actual glyphs are (not a hand-tuned
// layout) so particles can land precisely on letterforms.

export function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Lays words out either side-by-side on one line, or stacked one word per
// line (each line independently centered) — `stacked` picks which. Every
// segment gets a bounding box (startX/endX/top/bottom, all canvas-center-
// relative) regardless of layout, so callers can attribute a sampled point
// to a word the same way either way.
function layoutWords(ctx, words, fontSize, fontWeight, fontFamily, stacked) {
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const widths = words.map((w) => ctx.measureText(w.text).width);

  if (stacked) {
    const lineHeight = fontSize * 1.08;
    const lineGap = fontSize * 0.22;
    const totalHeight = lineHeight * words.length + lineGap * (words.length - 1);
    let cursorY = -totalHeight / 2 + lineHeight / 2;
    const segments = words.map((w, i) => {
      const seg = {
        ...w,
        width: widths[i],
        startX: -widths[i] / 2,
        endX: widths[i] / 2,
        centerY: cursorY,
        top: cursorY - lineHeight / 2,
        bottom: cursorY + lineHeight / 2,
      };
      cursorY += lineHeight + lineGap;
      return seg;
    });
    return { segments, totalWidth: Math.max(...widths), totalHeight, lineHeight };
  }

  const gap = fontSize * 0.32;
  const totalWidth = widths.reduce((a, b) => a + b, 0) + gap * (words.length - 1);
  let cursor = -totalWidth / 2;
  const segments = words.map((w, i) => {
    const seg = { ...w, width: widths[i], startX: cursor, endX: cursor + widths[i], centerY: 0, top: -fontSize / 2, bottom: fontSize / 2 };
    cursor += widths[i] + gap;
    return seg;
  });
  return { segments, totalWidth, totalHeight: fontSize, lineHeight: fontSize };
}

function nearestSegment(segments, relX, relY) {
  let best = segments[0];
  let bestDist = Infinity;
  for (const seg of segments) {
    const dx = Math.max(seg.startX - relX, 0, relX - seg.endX);
    const dy = Math.max(seg.top - relY, 0, relY - seg.bottom);
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = seg;
    }
  }
  return best;
}

// Picks the nearest of a word's `parts` by horizontal position only (parts
// always share the word's own top/bottom, so 1D distance is enough) — lets
// e.g. a word's first letter carry a different accent color than the rest
// without a rendering seam, since the word is still drawn as one string.
function nearestPart(parts, relX) {
  let best = parts[0];
  let bestDist = Infinity;
  for (const part of parts) {
    const dist = Math.max(part.startX - relX, 0, relX - part.endX);
    if (dist < bestDist) {
      bestDist = dist;
      best = part;
    }
  }
  return best;
}

// Renders `words` onto an offscreen canvas sized (width x height) and
// returns up to `maxPoints` points sampled evenly across the glyph pixels
// — each `{ x, y, word }`, x/y in absolute canvas pixel coordinates
// (canvas top-left origin), `word` the matching entry from `words`.
// `stacked: true` puts each word on its own centered line instead of
// side-by-side — use it whenever the container is closer to square than
// wide, so words don't get crushed down to an illegible font size fighting
// for width.
export function sampleGlyphPoints({ width, height, words, fontWeight, fontFamily, maxPoints, stacked = false }) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { points: [], centerX: width / 2, centerY: height / 2 };

  // Auto-fit: start from a size estimate for the layout mode, then shrink
  // once more if the actual measured text still overflows.
  let fontSize = stacked ? Math.max(16, (height / words.length) * 0.62) : Math.max(20, height * 0.72);
  let layout = layoutWords(ctx, words, fontSize, fontWeight, fontFamily, stacked);
  const maxWidth = width * 0.98;
  const maxHeight = height * 0.98;
  const overflow = Math.max(layout.totalWidth / maxWidth, layout.totalHeight / maxHeight);
  if (overflow > 1) {
    fontSize = Math.max(12, fontSize / overflow);
    layout = layoutWords(ctx, words, fontSize, fontWeight, fontFamily, stacked);
  }

  const centerX = width / 2;
  const centerY = height / 2;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fff";
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  layout.segments.forEach((seg) => ctx.fillText(seg.text, centerX + seg.startX, centerY + seg.centerY));

  // Optional per-word `parts` (e.g. [{text:"N", color:"#ff3b3b"}, {text:
  // "EXT", color:"#fff"}]) get their pixel-space bounds computed here, once
  // the real font/size is locked in — the word itself is still rendered as
  // a single fillText call above so kerning stays correct; this only slices
  // up the already-rendered glyph's width for color attribution below.
  layout.segments.forEach((seg) => {
    if (!seg.parts?.length) return;
    let cursor = seg.startX;
    seg.partBounds = seg.parts.map((part) => {
      const partWidth = ctx.measureText(part.text).width;
      const bound = { ...part, startX: cursor, endX: cursor + partWidth };
      cursor += partWidth;
      return bound;
    });
  });

  const { data } = ctx.getImageData(0, 0, width, height);
  const step = Math.max(2, Math.round(Math.min(width, height) / 130));
  const points = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (data[(y * width + x) * 4 + 3] > 120) points.push({ x, y });
    }
  }

  // Downsample evenly across the shape (not just the first N) so every
  // letter stays represented even when there are far more candidate pixels
  // than the particle budget.
  let chosen = points;
  if (points.length > maxPoints) {
    const stride = points.length / maxPoints;
    chosen = Array.from({ length: maxPoints }, (_, i) => points[Math.floor(i * stride)]);
  }

  const withWords = chosen.map((point) => {
    const relX = point.x - centerX;
    const seg = nearestSegment(layout.segments, relX, point.y - centerY);
    const word = seg.partBounds?.length ? nearestPart(seg.partBounds, relX) : seg;
    return { x: point.x, y: point.y, word };
  });

  return { points: withWords, centerX, centerY };
}
