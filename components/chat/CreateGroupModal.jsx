"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { loadChatDirectory } from "../../lib/chat-directory";
import { SkeletonBar, SkeletonCircle } from "../ui/Skeleton";

function initials(name) {
  return (name || "?").trim().slice(0, 2).toUpperCase();
}

// Matches one real selectable user row (checkbox + avatar circle + name/
// role lines).
function UserRowSkeleton() {
  return (
    <div className="flex items-center gap-2.5 border-b border-border-subtle px-3 py-2 last:border-b-0">
      <SkeletonBar className="h-4 w-4 shrink-0 rounded" />
      <SkeletonCircle className="h-7 w-7 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <SkeletonBar className="h-3 w-20" />
        <SkeletonBar className="h-2.5 w-14" />
      </div>
    </div>
  );
}

export default function CreateGroupModal({ onClose, onCreate, creating, error }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    loadChatDirectory()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) => `${user.displayName} ${user.email} ${user.role}`.toLowerCase().includes(term));
  }, [users, search]);

  function toggleMember(user) {
    setSelected((current) => (current.some((item) => item.uid === user.uid) ? current.filter((item) => item.uid !== user.uid) : [...current, { uid: user.uid, name: user.displayName, role: user.role }]));
  }
  function pickPhoto(file) {
    setPhotoFile(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : "");
  }

  const canSubmit = name.trim() && selected.length > 0 && !creating;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <b className="text-sm text-ink">Create Group</b>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg text-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-4">
          <div className="flex items-center gap-3">
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-full bg-page text-[10px] font-bold text-subtle">Photo</span>
            )}
            <input type="file" accept="image/*" onChange={(e) => pickPhoto(e.target.files?.[0] || null)} className="text-[11px]" />
          </div>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Group Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="e.g. Web Development Batch 03" className="rounded-lg border border-border-subtle px-3 py-2 text-xs font-normal" />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            Group Description (optional)
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} className="rounded-lg border border-border-subtle px-3 py-2 text-xs font-normal" />
          </label>

          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((member) => (
                <span key={member.uid} className="flex items-center gap-1 rounded-full bg-active px-2.5 py-1 text-[10px] font-bold text-primary">
                  {member.name}
                  <button type="button" onClick={() => toggleMember({ uid: member.uid })} aria-label={`Remove ${member.name}`}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-subtle" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, or role..." className="w-full rounded-lg border border-border-subtle bg-page py-2 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border-subtle">
            {loading ? (
              <div>{Array.from({ length: 5 }).map((_, i) => <UserRowSkeleton key={i} />)}</div>
            ) : filtered.length ? (
              filtered.map((user) => {
                const isChecked = selected.some((item) => item.uid === user.uid);
                return (
                  <button key={user.uid} type="button" onClick={() => toggleMember(user)} className="flex w-full items-center gap-2.5 border-b border-border-subtle px-3 py-2 text-left last:border-b-0 hover:bg-page">
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[9px] font-bold ${isChecked ? "border-primary bg-primary text-white" : "border-border-subtle text-transparent"}`}>✓</span>
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-[9px] font-bold text-white">{initials(user.displayName)}</span>
                    <span className="min-w-0">
                      <b className="block truncate text-xs text-ink">{user.displayName}</b>
                      <span className="text-[10px] text-subtle">{user.role}</span>
                    </span>
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-6 text-center text-xs text-muted">No users match your search.</p>
            )}
          </div>
          {error && <p className="text-xs text-primary">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 border-t border-border-subtle px-4 py-3">
          <button type="button" onClick={onClose} disabled={creating} className="rounded-lg px-4 py-2 text-xs font-bold text-muted">Cancel</button>
          <button type="button" onClick={() => onCreate({ name, description, members: selected, photoFile })} disabled={!canSubmit} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
            {creating ? "Creating..." : "Create Group"}
          </button>
        </div>
      </div>
    </div>
  );
}
