"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { auth } from "../../lib/firebase";
import { resolvePhoto } from "../../lib/public-assets";

async function uploadPhoto(file, folder) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const body = new FormData();
  body.append("file", file);
  body.append("folder", folder);
  const response = await fetch("/api/admin/site-content/photo", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to upload the photo.");
  return data.url;
}

// Photo picker for Website content cards and Team members: upload a file
// from the device, or paste a URL / /public path as before. Shows a preview.
export default function PhotoField({ value, onChange, folder = "site", placeholder, inputClassName }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function pick(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      onChange(await uploadPhoto(file, folder));
    } catch (uploadError) {
      setError(uploadError.message || "Unable to upload the photo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <span className="block text-xs font-bold text-muted">Photo</span>
      <div className="flex items-center gap-3">
        <span className="grid h-16 w-24 shrink-0 place-items-center overflow-hidden rounded-xl border border-border-subtle bg-page text-[10px] font-bold text-subtle">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {value ? <img src={resolvePhoto(value)} alt="" className="h-full w-full object-cover" /> : "No photo"}
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl border border-border-subtle px-3 py-2 text-xs font-bold text-ink hover:bg-active hover:text-primary disabled:opacity-60"
          >
            <Upload className="h-4 w-4" aria-hidden="true" /> {uploading ? "Uploading..." : value ? "Change photo" : "Upload photo"}
          </button>
          {value && !uploading && (
            <button type="button" onClick={() => onChange("")} className="rounded-xl px-3 py-2 text-xs font-bold text-primary hover:bg-active">
              Remove
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" onChange={pick} className="hidden" />
      </div>
      <label className="block text-[11px] font-semibold text-subtle">…or paste a photo URL
        <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={inputClassName} />
      </label>
      <p className="text-[11px] text-subtle">JPG, PNG, WEBP, GIF or AVIF, under 5 MB.</p>
      {error && <p className="text-[11px] font-semibold text-primary">{error}</p>}
    </div>
  );
}
