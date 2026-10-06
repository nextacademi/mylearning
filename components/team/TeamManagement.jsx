"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteTeamMember, loadTeam, reorderTeam, saveTeamMember } from "../../lib/services/team-service";
import { resolvePhoto } from "../../lib/public-assets";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import PhotoField from "./PhotoField";

// Director / Admin "Team" tab — manages the people shown in the public
// homepage's "Our Team" slider (add, edit, reorder, remove).
const SOCIALS = [
  ["facebook", "Facebook"],
  ["instagram", "Instagram"],
  ["linkedin", "LinkedIn"],
  ["twitter", "X (Twitter)"],
];
const blank = { name: "", role: "", photo: "", socials: { facebook: "", instagram: "", linkedin: "", twitter: "" } };

function MemberForm({ initial, saving, onSave, onCancel }) {
  const [form, setForm] = useState({ ...blank, ...initial, socials: { ...blank.socials, ...initial?.socials } });
  const field = "mt-1 w-full rounded-xl border border-border-subtle bg-card px-3 py-2.5 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" role="dialog" aria-modal="true">
      <form
        onSubmit={(event) => { event.preventDefault(); onSave(form); }}
        className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl"
      >
        <h2 className="text-lg font-bold text-ink">{initial?.id ? "Edit team member" : "Add team member"}</h2>
        <label className="block text-xs font-bold text-muted">Name
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} />
        </label>
        <label className="block text-xs font-bold text-muted">Role
          <input required value={form.role} placeholder="Teacher, Founder, Facilitator…" onChange={(e) => setForm({ ...form, role: e.target.value })} className={field} />
        </label>
        <PhotoField folder="team" value={form.photo} placeholder="https://… or /team/name.jpg" onChange={(photo) => setForm((current) => ({ ...current, photo }))} inputClassName={field} />
        <div className="grid gap-3 sm:grid-cols-2">
          {SOCIALS.map(([key, label]) => (
            <label key={key} className="block text-xs font-bold text-muted">{label} link
              <input value={form.socials[key]} placeholder="https://…" onChange={(e) => setForm({ ...form, socials: { ...form.socials, [key]: e.target.value } })} className={field} />
            </label>
          ))}
        </div>
        <p className="text-[11px] text-subtle">Leave a social link empty to hide that icon. A missing photo shows initials.</p>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl px-4 py-2 text-sm font-bold text-muted">Cancel</button>
          <button disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

// `embedded`: rendered as the "Team" sub-tab inside Website content, which
// already provides the page heading.
export default function TeamManagement({ embedded = false }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | member
  const [saving, setSaving] = useState(false);

  const load = () => {
    loadTeam()
      .then((data) => { setMembers(data.members || []); setError(""); })
      .catch((err) => setError(err.message || "Unable to load the team."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { void Promise.resolve().then(load); }, []);

  async function save(form) {
    setSaving(true);
    try {
      await saveTeamMember(form);
      toast.success("Team member saved.");
      setEditing(null);
      load();
    } catch (err) {
      toast.error(err.message || "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(member) {
    if (!(await confirm({ title: "Remove team member?", message: `${member.name} will no longer appear on the website.`, confirmLabel: "Remove", tone: "danger" }))) return;
    try {
      await deleteTeamMember(member.id);
      toast.success("Team member removed.");
      load();
    } catch (err) {
      toast.error(err.message || "Unable to remove.");
    }
  }

  async function move(index, direction) {
    const next = [...members];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setMembers(next);
    try {
      await reorderTeam(next.map((m) => m.id));
    } catch (err) {
      toast.error(err.message || "Unable to reorder.");
      load();
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {!embedded && <h2 className="text-xl font-black text-ink">Team</h2>}
          <p className="text-xs text-muted">People shown in the “Our Team” slider on the homepage. The order here is the order on the site.</p>
        </div>
        <button type="button" onClick={() => setEditing("new")} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white hover:opacity-90">
          <Plus className="h-4 w-4" aria-hidden="true" /> Add member
        </button>
      </div>

      {error && <p className="rounded-xl bg-active px-4 py-3 text-sm text-primary">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted">Loading team…</p>
      ) : (
        <div className="divide-y divide-border-subtle rounded-3xl border border-border-subtle bg-card shadow-sm">
          {members.map((member, index) => (
            <div key={member.id} className="flex items-center gap-3 p-3 sm:p-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-page text-sm font-black text-primary">
                {member.photo ? <img src={resolvePhoto(member.photo)} alt="" className="h-full w-full object-cover" /> : (member.name || "?")[0]}
              </span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-sm text-ink">{member.name}</b>
                <span className="block truncate text-xs text-muted">{member.role}</span>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Move up" className="rounded-lg p-2 text-muted hover:bg-page disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === members.length - 1} aria-label="Move down" className="rounded-lg p-2 text-muted hover:bg-page disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" onClick={() => setEditing(member)} className="inline-flex items-center gap-1 rounded-lg bg-info px-2.5 py-1.5 text-[11px] font-bold text-white hover:opacity-90"><Pencil className="h-3.5 w-3.5" /> Edit</button>
                <button type="button" onClick={() => remove(member)} aria-label={`Remove ${member.name}`} className="rounded-lg p-2 text-primary hover:bg-active"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
          {!members.length && !error && <p className="p-8 text-center text-sm text-muted">No team members yet.</p>}
        </div>
      )}

      {editing && <MemberForm initial={editing === "new" ? null : editing} saving={saving} onSave={save} onCancel={() => !saving && setEditing(null)} />}
    </section>
  );
}
