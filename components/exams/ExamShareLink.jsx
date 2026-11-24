"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, QrCode } from "lucide-react";
import { SITE_URL } from "../../lib/seo";
import { examPath } from "../../lib/exam-shared";

// The student link for one exam (https://nextacademy.sg/exam/<quizId>).
export const examUrl = (quizId) => `${SITE_URL}${examPath(quizId)}`;
const shortLabel = (url) => url.replace(/^https?:\/\//, "");

// Small QR on the right of a staff exam card; opens the full-screen QR.
export function ExamQrThumb({ url, title, onOpen }) {
  const [image, setImage] = useState("");
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 1, width: 192, color: { dark: "#000000", light: "#ffffff" } })
      .then((dataUrl) => { if (!cancelled) setImage(dataUrl); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url]);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Show QR code for ${title}`}
      title="Show QR code"
      className="group grid shrink-0 justify-items-center gap-1 rounded-xl bg-white p-1.5 ring-1 ring-border-subtle transition-[box-shadow,transform] duration-200 hover:shadow-[0_8px_20px_-12px_rgb(31_35_40/0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-[0.97]"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-[72px] w-[72px]" />
      ) : (
        <span className="grid h-[72px] w-[72px] place-items-center text-slate-400"><QrCode className="h-6 w-6" aria-hidden="true" /></span>
      )}
      <span className="text-[10px] font-semibold text-slate-600 group-hover:text-slate-900">Scan</span>
    </button>
  );
}

// The short link with a Copy button, under the exam's stats.
export function ExamLinkRow({ url }) {
  const [copied, setCopied] = useState(""); // "" | "ok" | "failed"
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("ok");
    } catch {
      setCopied("failed"); // clipboard blocked: the link itself is still there to copy by hand
    }
    setTimeout(() => setCopied(""), 1800);
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-lg bg-page px-2 py-1.5 ring-1 ring-border-subtle">
      <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink hover:text-primary" title={url}>
        {shortLabel(url)}
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy exam link"
        className={`flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${copied === "ok" ? "text-success" : copied === "failed" ? "text-primary" : "text-muted hover:bg-card hover:text-ink"}`}
      >
        {copied === "ok" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        <span aria-live="polite">{copied === "ok" ? "Copied" : copied === "failed" ? "Copy blocked" : "Copy"}</span>
      </button>
    </div>
  );
}
