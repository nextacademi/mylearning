"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, X } from "lucide-react";
import { SITE_URL } from "../../lib/seo";

// Where a scan lands: the student sign-up page.
const JOIN_URL = `${SITE_URL}/register`;
const SIZE = 720;
// Share of the QR's width covered by the logo. Error correction "H" still
// reads a code with up to ~30% of it hidden; this covers about 6%.
const LOGO_SHARE = 0.24;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

// The QR with the Next Academy logo in the middle, as a PNG data URL.
async function joinQrImage() {
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, JOIN_URL, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: SIZE,
    color: { dark: "#000000", light: "#ffffff" },
  });
  try {
    const logo = await loadImage("/logo.jpeg");
    const box = Math.round(canvas.width * LOGO_SHARE);
    const x = Math.round((canvas.width - box) / 2);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(x, x, box, box);
    context.drawImage(logo, x, x, box, box);
  } catch {
    // No logo, still a working QR.
  }
  return canvas.toDataURL("image/png");
}

// "Join us" — a full white screen with a large QR code students scan with
// their phone camera to open the sign-up page. White on purpose (also in
// dark mode) so the code scans reliably from a projector or screen.
export default function JoinQrDialog({ onClose }) {
  const [image, setImage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    joinQrImage()
      .then((dataUrl) => { if (!cancelled) setImage(dataUrl); })
      .catch(() => { if (!cancelled) setError("Unable to create the QR code."); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-y-auto bg-white p-6 text-center text-slate-900" role="dialog" aria-modal="true" aria-label="Join Next Academy">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        <X className="h-6 w-6" aria-hidden="true" />
      </button>
      <h2 className="text-2xl font-black md:text-4xl">
        Join <span className="text-[#ff2d2d]">Next Academy</span>
      </h2>
      <p className="mt-2 text-base text-slate-600 md:text-lg">Scan with your phone camera to sign up</p>
      {error ? (
        <p className="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p>
      ) : image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={`QR code for ${JOIN_URL}`} className="mt-6 aspect-square w-[min(80vw,62vh)] max-w-[560px]" />
      ) : (
        <div className="mt-6 grid aspect-square w-[min(80vw,62vh)] max-w-[560px] place-items-center text-sm text-slate-500">Creating QR code…</div>
      )}
      <p className="mt-4 break-all text-sm font-semibold text-slate-600">{JOIN_URL}</p>
      {image && (
        <a
          href={image}
          download="next-academy-join-qr.png"
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Download QR
        </a>
      )}
    </div>
  );
}
