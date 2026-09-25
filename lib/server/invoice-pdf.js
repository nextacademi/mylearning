import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { ACADEMY_INFO } from "./academy-info";

// One professional invoice layout shared by the enrollment-invoice and
// manual-invoice routes — they only differ in where the data comes from, so
// they normalize into the shape below and hand it here.
//
// invoice = {
//   invoiceNumber, issueDate, dueDate?, status,
//   student: { name, email, phone },
//   meta: [{ label, value }]            // up to 3, shown in a strip under the header
//   items: [{ description, sub?, amount }],
//   subtotal, discount, total, paid, due,
//   payments: [{ date, method, reference, amount }],
//   notes?
// }

const W = 595;
const H = 842;
const M = 44;
const CONTENT_W = W - M * 2;

const RED = rgb(0.85, 0.08, 0.11);
const INK = rgb(0.07, 0.09, 0.15);
const GRAY = rgb(0.42, 0.45, 0.5);
const LIGHT = rgb(0.965, 0.968, 0.975);
const BORDER = rgb(0.88, 0.89, 0.91);
const GREEN = rgb(0.06, 0.5, 0.3);
const WHITE = rgb(1, 1, 1);

const money = (value) => `S$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Plain YYYY-MM-DD strings are formatted by string math so a server
// timezone can never shift the day; full ISO timestamps go through Date.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(value) {
  if (!value) return "—";
  const text = String(value);
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (plain) return `${plain[3]} ${MONTHS[Number(plain[2]) - 1]} ${plain[1]}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return `${String(parsed.getUTCDate()).padStart(2, "0")} ${MONTHS[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`;
}

const STATUS_TONE = {
  Paid: { bg: rgb(0.87, 0.96, 0.91), fg: GREEN },
  Partial: { bg: rgb(1, 0.95, 0.84), fg: rgb(0.7, 0.42, 0.02) },
  Cancelled: { bg: rgb(0.92, 0.92, 0.93), fg: GRAY },
};
const DEFAULT_TONE = { bg: rgb(0.99, 0.9, 0.9), fg: RED };

let logoCache = null;
async function loadLogo(origin) {
  if (logoCache) return logoCache;
  try {
    logoCache = await fs.readFile(path.join(process.cwd(), "public", "logo.jpeg"));
    return logoCache;
  } catch {
    // Deployed bundles don't always ship /public next to the server code —
    // the same file is always reachable over HTTP from our own origin.
  }
  if (origin) {
    try {
      const response = await fetch(new URL("/logo.jpeg", origin));
      if (response.ok) {
        logoCache = Buffer.from(await response.arrayBuffer());
        return logoCache;
      }
    } catch {
      // Fall through — the letterhead simply renders without the image.
    }
  }
  return null;
}

export async function buildInvoicePdf(invoice, { origin } = {}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([W, H]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);

  // Standard PDF fonts only encode Latin-1/WinAnsi. A student name in
  // Bangla/Chinese/etc. would otherwise throw and fail the whole PDF, so
  // anything unencodable degrades to "?" instead.
  const safeCache = new Map();
  const safe = (value) =>
    Array.from(String(value ?? "").replace(/\s+/g, " "))
      .map((ch) => {
        if (safeCache.has(ch)) return safeCache.get(ch);
        let out = ch;
        try {
          regular.encodeText(ch);
        } catch {
          out = "?";
        }
        safeCache.set(ch, out);
        return out;
      })
      .join("");

  const width = (str, size, font) => font.widthOfTextAtSize(str, size);
  const fit = (value, size, font, maxWidth) => {
    let str = safe(value);
    if (width(str, size, font) <= maxWidth) return str;
    while (str.length > 1 && width(`${str}…`, size, font) > maxWidth) str = str.slice(0, -1);
    return `${str}…`;
  };
  const wrap = (value, size, font, maxWidth) => {
    const words = safe(value).split(" ").filter(Boolean);
    const lines = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (width(next, size, font) <= maxWidth || !current) current = next;
      else {
        lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  };

  // Top-down coordinates (like a layout sketch) mapped onto PDF's bottom-up.
  const rect = (x, top, w, h, options) => page.drawRectangle({ x, y: H - top - h, width: w, height: h, ...options });
  const text = (value, x, top, size, font = regular, color = INK) => page.drawText(safe(value), { x, y: H - top, size, font, color });
  const rtext = (value, xRight, top, size, font = regular, color = INK) => {
    const str = safe(value);
    page.drawText(str, { x: xRight - width(str, size, font), y: H - top, size, font, color });
  };
  const ctext = (value, top, size, font = regular, color = INK) => {
    const str = safe(value);
    page.drawText(str, { x: (W - width(str, size, font)) / 2, y: H - top, size, font, color });
  };
  const hline = (top, x1, x2, color = BORDER, thickness = 0.75) =>
    page.drawLine({ start: { x: x1, y: H - top }, end: { x: x2, y: H - top }, thickness, color });

  const status = invoice.status || "Unpaid";
  const tone = STATUS_TONE[status] || DEFAULT_TONE;
  const due = Number(invoice.due) || 0;

  // ---- Watermark (drawn first so content sits on top) ----
  if (status === "Paid" || status === "Cancelled") {
    const label = status === "Paid" ? "PAID" : "CANCELLED";
    const size = status === "Paid" ? 130 : 78;
    const textWidth = width(label, size, bold);
    const angle = 28;
    const rad = (angle * Math.PI) / 180;
    page.drawText(label, {
      x: W / 2 - (textWidth / 2) * Math.cos(rad),
      y: H / 2 - (textWidth / 2) * Math.sin(rad) - size * 0.2,
      size,
      font: bold,
      color: status === "Paid" ? GREEN : GRAY,
      opacity: 0.07,
      rotate: degrees(angle),
    });
  }

  // ---- Accent bars ----
  rect(0, 0, W, 7, { color: RED });
  rect(0, H - 6, W, 6, { color: RED });

  // ---- Letterhead ----
  const LOGO = 74;
  const logoBytes = await loadLogo(origin);
  let textX = M;
  if (logoBytes) {
    try {
      const image = await pdf.embedJpg(logoBytes);
      page.drawImage(image, { x: M, y: H - 26 - LOGO, width: LOGO, height: LOGO });
      // The JPEG's background is very slightly off-white; a hairline frame
      // makes that read as an intentional logo tile rather than a smudge.
      rect(M, 26, LOGO, LOGO, { borderColor: BORDER, borderWidth: 0.75 });
      textX = M + LOGO + 14;
    } catch {
      // Unreadable image — keep the text-only letterhead.
    }
  }
  text(ACADEMY_INFO.name.toUpperCase(), textX, 44, 17, bold, RED);
  text(ACADEMY_INFO.tagline, textX, 57, 8.5, regular, GRAY);
  const contactLines = [ACADEMY_INFO.legalName, ...ACADEMY_INFO.addressLines, ACADEMY_INFO.email].filter(Boolean);
  contactLines.forEach((line, index) => text(line, textX, 75 + index * 10.5, 8.5, index === 0 ? bold : regular, index === 0 ? INK : GRAY));

  rtext("INVOICE", W - M, 58, 30, bold, INK);
  rtext(`No. ${invoice.invoiceNumber || "—"}`, W - M, 76, 10.5, bold, GRAY);
  const pillLabel = safe(status.toUpperCase());
  const pillW = width(pillLabel, 8.5, bold) + 20;
  rect(W - M - pillW, 86, pillW, 17, { color: tone.bg });
  text(pillLabel, W - M - pillW + 10, 98, 8.5, bold, tone.fg);

  hline(116, M, W - M, BORDER, 1);
  hline(116, M, M + 64, RED, 2.5);

  // ---- Billed to + summary box ----
  const student = invoice.student || {};
  text("BILLED TO", M, 144, 8, bold, GRAY);
  text(fit(student.name || "Student", 13, bold, 250), M, 163, 13, bold, INK);
  text(fit(student.email || "—", 10, regular, 250), M, 179, 10, regular, GRAY);
  if (student.phone) text(fit(student.phone, 10, regular, 250), M, 193, 10, regular, GRAY);

  const boxW = 236;
  const boxX = W - M - boxW;
  rect(boxX, 132, boxW, 82, { color: LIGHT, borderColor: BORDER, borderWidth: 0.75 });
  text("Issue Date", boxX + 14, 152, 9.5, regular, GRAY);
  rtext(fmtDate(invoice.issueDate), boxX + boxW - 14, 152, 9.5, bold, INK);
  if (invoice.dueDate) {
    text("Due Date", boxX + 14, 168, 9.5, regular, GRAY);
    rtext(fmtDate(invoice.dueDate), boxX + boxW - 14, 168, 9.5, bold, INK);
  } else {
    text("Currency", boxX + 14, 168, 9.5, regular, GRAY);
    rtext("SGD", boxX + boxW - 14, 168, 9.5, bold, INK);
  }
  hline(177, boxX + 14, boxX + boxW - 14, BORDER);
  text(due > 0 ? "BALANCE DUE" : "BALANCE", boxX + 14, 201, 8, bold, GRAY);
  rtext(money(due), boxX + boxW - 14, 203, 16, bold, due > 0 ? RED : GREEN);

  // ---- Meta strip ----
  const meta = (invoice.meta || []).slice(0, 3);
  let cursor = 226;
  if (meta.length) {
    rect(M, cursor, CONTENT_W, 42, { color: WHITE, borderColor: BORDER, borderWidth: 0.75 });
    const colW = CONTENT_W / meta.length;
    meta.forEach((item, index) => {
      const x = M + colW * index;
      if (index > 0) page.drawLine({ start: { x, y: H - cursor - 8 }, end: { x, y: H - cursor - 34 }, thickness: 0.75, color: BORDER });
      text(String(item.label).toUpperCase(), x + 14, cursor + 16, 7.5, bold, GRAY);
      text(fit(item.value || "—", 10, bold, colW - 28), x + 14, cursor + 31, 10, bold, INK);
    });
    cursor += 42 + 22;
  }

  // ---- Line items ----
  rect(M, cursor, CONTENT_W, 24, { color: INK });
  text("DESCRIPTION", M + 14, cursor + 16, 8.5, bold, WHITE);
  rtext("AMOUNT", W - M - 14, cursor + 16, 8.5, bold, WHITE);
  cursor += 24;
  (invoice.items || []).forEach((item, index) => {
    const descLines = wrap(item.description || "Item", 10.5, bold, CONTENT_W - 28 - 120);
    const subLines = item.sub ? wrap(item.sub, 8.5, regular, CONTENT_W - 28 - 120) : [];
    const rowH = Math.max(40, 18 + descLines.length * 13 + subLines.length * 11 + 8);
    if (index % 2 === 0) rect(M, cursor, CONTENT_W, rowH, { color: LIGHT });
    descLines.forEach((line, i) => text(line, M + 14, cursor + 20 + i * 13, 10.5, bold, INK));
    subLines.forEach((line, i) => text(line, M + 14, cursor + 20 + descLines.length * 13 + 2 + i * 11, 8.5, regular, GRAY));
    rtext(money(item.amount), W - M - 14, cursor + 20, 10.5, bold, INK);
    cursor += rowH;
    hline(cursor, M, W - M);
  });

  // ---- Totals (right) + notes (left) ----
  const totalsTop = cursor + 18;
  const totalsW = 236;
  const totalsX = W - M - totalsW;
  let ty = totalsTop;
  const totalRow = (label, value, options = {}) => {
    text(label, totalsX + 8, ty + 14, options.size || 10, options.labelFont || regular, options.labelColor || GRAY);
    rtext(value, totalsX + totalsW - 8, ty + 14, options.size || 10, options.valueFont || bold, options.valueColor || INK);
    ty += options.h || 21;
  };
  totalRow("Subtotal", money(invoice.subtotal));
  if (Number(invoice.discount) > 0) totalRow("Discount", `-${money(invoice.discount)}`, { valueColor: GREEN });
  hline(ty + 2, totalsX, W - M);
  ty += 8;
  totalRow("Total", money(invoice.total), { size: 12, labelFont: bold, labelColor: INK, valueFont: bold, h: 24 });
  totalRow("Amount Paid", money(invoice.paid), { valueColor: GREEN });
  ty += 4;
  rect(totalsX, ty, totalsW, 32, { color: due > 0 ? RED : GREEN });
  text(due > 0 ? "BALANCE DUE" : "FULLY PAID", totalsX + 12, ty + 20, 10, bold, WHITE);
  rtext(money(due), totalsX + totalsW - 12, ty + 21, 13, bold, WHITE);
  ty += 32;

  if (invoice.notes) {
    text("NOTES", M, totalsTop + 12, 8, bold, GRAY);
    wrap(invoice.notes, 9, regular, totalsX - M - 24)
      .slice(0, 6)
      .forEach((line, i) => text(line, M, totalsTop + 28 + i * 12, 9, regular, INK));
  }

  // ---- Payment history ----
  let py = ty + 26;
  text("PAYMENT HISTORY", M, py, 8, bold, GRAY);
  py += 8;
  const payments = invoice.payments || [];
  if (!payments.length) {
    text("No payments recorded yet.", M, py + 16, 9.5, regular, GRAY);
  } else {
    rect(M, py, CONTENT_W, 20, { color: LIGHT, borderColor: BORDER, borderWidth: 0.75 });
    text("DATE", M + 12, py + 13, 8, bold, GRAY);
    text("METHOD", M + 112, py + 13, 8, bold, GRAY);
    text("REFERENCE", M + 232, py + 13, 8, bold, GRAY);
    rtext("AMOUNT", W - M - 12, py + 13, 8, bold, GRAY);
    py += 20;
    // One page is the point of an invoice — the in-app Payment History has
    // the complete ledger. Stop before the footer instead of overflowing.
    const limit = 752;
    let shown = 0;
    for (const payment of payments) {
      if (py + 20 > limit) break;
      if (shown % 2 === 1) rect(M, py, CONTENT_W, 20, { color: LIGHT });
      text(fmtDate(payment.date), M + 12, py + 14, 9.5, regular, INK);
      text(fit(payment.method || "—", 9.5, regular, 110), M + 112, py + 14, 9.5, regular, INK);
      text(fit(payment.reference || "—", 9.5, regular, 190), M + 232, py + 14, 9.5, regular, INK);
      rtext(money(payment.amount), W - M - 12, py + 14, 9.5, bold, INK);
      py += 20;
      shown += 1;
    }
    hline(py, M, W - M);
    if (shown < payments.length) text(`+ ${payments.length - shown} more payment(s) — see Payment History in your account for the full list.`, M, py + 14, 8, regular, GRAY);
  }

  // ---- Footer ----
  hline(770, M, W - M);
  ctext(`Thank you for learning with ${ACADEMY_INFO.name}.`, 785, 9.5, bold, INK);
  ctext(`${ACADEMY_INFO.legalName}  •  ${ACADEMY_INFO.addressLines.join(", ")}`, 797, 8, bold, INK);
  ctext([ACADEMY_INFO.email, ACADEMY_INFO.website].filter(Boolean).join("  •  "), 808, 8, regular, GRAY);
  ctext("This is a computer-generated invoice and does not require a signature.", 820, 7.5, regular, GRAY);

  return pdf.save();
}
