"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { loadChatDirectory, uploadGroupPhoto } from "../../lib/chat-directory";
import { addGroupMembers, leaveGroup, removeGroupMember, renameGroup, updateGroupDescription, updateGroupPhoto } from "../../lib/chat-data";
import { useConfirm } from "../ui/ConfirmDialog";

function initials(name) {
  return (name || "?").trim().slice(0, 2).toUpperCase();
}

// Rename/photo/description/add-remove members are only offered to a
// groupAdminIds member — mirrors firestore.rules' group-admin update
// branch exactly, so a non-admin never sees a control that would just be
// denied server-side. "Leave Group" is always available to any member.
export default function GroupSettingsPanel({ conversation, currentUserId, onClose, onLeave, onNotice }) {
  const isAdmin = (conversation.groupAdminIds || []).includes(currentUserId);
  const confirm = useConfirm();
  const [name, setName] = useState(conversation.groupName || "");
  const [description, setDescription] = useState(conversation.groupDescription || "");
  const [photoPreview, setPhotoPreview] = useState(conversation.groupPhoto || "");
  const [savingInfo, setSavingInfo] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [directory, setDirectory] = useState([]);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState([]);

  useEffect(() => {
    if (!adding) return;
    loadChatDirectory().then(setDirectory).catch(() => setDirectory([]));
  }, [adding]);

  const members = conversation.participantIds.map((uid) => ({
    uid,
    name: conversation.participantNames?.[uid] || "Member",
    role: conversation.participantRoles?.[uid] || "",
    admin: (conversation.groupAdminIds || []).includes(uid),
  }));

  const addable = useMemo(() => {
    const term = search.trim().toLowerCase();
    return directory
      .filter((user) => !conversation.participantIds.includes(user.uid))
      .filter((user) => !term || `${user.displayName} ${user.email} ${user.role}`.toLowerCase().includes(term));
  }, [directory, search, conversation.participantIds]);

  async function saveInfo() {
    setSavingInfo(true);
    setError("");
    try {
      if (name.trim() !== conversation.groupName) await renameGroup(conversation.id, name);
      if (description.trim() !== (conversation.groupDescription || "")) await updateGroupDescription(conversation.id, description);
      onNotice("Group updated.");
    } catch (err) {
      setError(err.message || "Unable to update the group.");
    } finally {
      setSavingInfo(false);
    }
  }

  async function pickPhoto(file) {
    if (!file) return;
    setPhotoPreview(URL.createObjectURL(file));
    setSavingInfo(true);
    setError("");
    try {
      const photoUrl = await uploadGroupPhoto(conversation.id, file);
      await updateGroupPhoto(conversation.id, photoUrl);
      onNotice("Group photo updated.");
    } catch (err) {
      setError(err.message || "Unable to update the group photo.");
    } finally {
      setSavingInfo(false);
    }
  }

  async function togglePicked(user) {
    setPicked((current) => (current.some((item) => item.uid === user.uid) ? current.filter((item) => item.uid !== user.uid) : [...current, { uid: user.uid, name: user.displayName, role: user.role }]));
  }
  async function confirmAdd() {
    if (!picked.length) return;
    try {
      await addGroupMembers(conversation, picked);
      onNotice(`${picked.length} member(s) added.`);
      setAdding(false);
      setPicked([]);
    } catch (err) {
      setError(err.message || "Unable to add members.");
    }
  }
  async function remove(memberUid) {
    if (!(await confirm({ title: "Remove member", message: "Remove this member from the group?", tone: "danger", confirmLabel: "Remove" }))) return;
    try {
      await removeGroupMember(conversation, memberUid);
      onNotice("Member removed.");
    } catch (err) {
      setError(err.message || "Unable to remove this member.");
    }
  }
  async function leave() {
    if (!(await confirm({ title: "Leave group", message: "Leave this group? You'll stop receiving its messages.", tone: "danger", confirmLabel: "Leave" }))) return;
    try {
      await leaveGroup(conversation, currentUserId);
      onLeave();
    } catch (err) {
      setError(err.message || "Unable to leave this group.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <b className="text-sm text-ink">Group Info</b>
          <button type="button" onClick={onClose} aria-label="Close" className="text-lg text-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 overflow-y-auto p-4">
          <div className="flex items-center gap-3">
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              <span className="grid h-14 w-14 place-items-center rounded-full bg-primary text-sm font-bold text-white">{initials(name)}</span>
            )}
            {isAdmin && <input type="file" accept="image/*" onChange={(e) => pickPhoto(e.target.files?.[0] || null)} className="text-[11px]" />}
          </div>

          {isAdmin ? (
            <>
              <label className="grid gap-1 text-xs font-bold text-muted">
                Group Name
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className="rounded-lg border border-border-subtle px-3 py-2 text-xs font-normal" />
              </label>
              <label className="grid gap-1 text-xs font-bold text-muted">
                Description
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} className="rounded-lg border border-border-subtle px-3 py-2 text-xs font-normal" />
              </label>
              <button type="button" onClick={saveInfo} disabled={savingInfo} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{savingInfo ? "Saving..." : "Save changes"}</button>
            </>
          ) : (
            <div>
              <p className="text-sm font-bold text-ink">{conversation.groupName}</p>
              {conversation.groupDescription && <p className="mt-1 text-xs text-muted">{conversation.groupDescription}</p>}
            </div>
          )}
          {error && <p className="text-xs text-primary">{error}</p>}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Members ({members.length})</p>
              {isAdmin && !adding && <button type="button" onClick={() => setAdding(true)} className="text-xs font-bold text-primary">+ Add members</button>}
            </div>

            {adding ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-subtle" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="w-full rounded-lg border border-border-subtle bg-page py-2 pl-8 pr-3 text-xs outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-border-subtle">
                  {addable.length ? addable.map((user) => {
                    const checked = picked.some((item) => item.uid === user.uid);
                    return (
                      <button key={user.uid} type="button" onClick={() => togglePicked(user)} className="flex w-full items-center gap-2 border-b border-border-subtle px-2.5 py-1.5 text-left last:border-b-0 hover:bg-page">
                        <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[9px] font-bold ${checked ? "border-primary bg-primary text-white" : "border-border-subtle text-transparent"}`}>✓</span>
                        <span className="min-w-0 text-xs"><b className="block truncate text-ink">{user.displayName}</b><span className="text-[10px] text-subtle">{user.role}</span></span>
                      </button>
                    );
                  }) : <p className="px-2.5 py-4 text-center text-xs text-muted">No more users to add.</p>}
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setAdding(false); setPicked([]); }} className="rounded-lg px-3 py-1.5 text-xs font-bold text-muted">Cancel</button>
                  <button type="button" onClick={confirmAdd} disabled={!picked.length} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Add ({picked.length})</button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {members.map((member) => (
                  <div key={member.uid} className="flex items-center justify-between gap-2 rounded-lg bg-page px-2.5 py-2 text-xs">
                    <span className="min-w-0">
                      <b className="block truncate text-ink">{member.name}{member.uid === currentUserId ? " (You)" : ""}</b>
                      <span className="text-[10px] text-subtle">{member.role}{member.admin ? " · Admin" : ""}</span>
                    </span>
                    {isAdmin && member.uid !== currentUserId && (
                      <button type="button" onClick={() => remove(member.uid)} className="shrink-0 text-[10px] font-bold text-primary hover:underline">Remove</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="button" onClick={leave} className="w-full rounded-lg border border-border-subtle px-3 py-2 text-xs font-bold text-primary hover:bg-active">Leave Group</button>
        </div>
      </div>
    </div>
  );
}
