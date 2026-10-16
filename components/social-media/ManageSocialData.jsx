"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, FileUp, Loader2, Pencil, Plug, Plus, Search, Trash2, X } from "lucide-react";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import {
  deleteSocialPost, loadSocialPosts, saveSocialAccount, saveSocialPosts,
} from "../../lib/services/social-media-service";
import { CSV_COLUMNS, PLATFORMS, PLATFORM_KEYS, isPlatform, postsFromCsv, sgtDate } from "../../lib/social-media-shared";
import { PlatformMark, compact, formatPostDate, formatSyncTime } from "./parts";

const field = "w-full rounded-xl border border-border-subtle bg-page px-3 py-2 text-sm text-ink placeholder:text-subtle focus:border-primary focus:outline-none";
const ENV_VARS = {
  facebook: ["META_PAGE_ID", "META_PAGE_ACCESS_TOKEN"],
  instagram: ["META_IG_USER_ID", "META_PAGE_ACCESS_TOKEN (or META_IG_ACCESS_TOKEN)"],
  tiktok: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REFRESH_TOKEN"],
  youtube: ["YOUTUBE_API_KEY", "YOUTUBE_CHANNEL_ID"],
};
const TABS = [["posts", "Posts"], ["accounts", "Accounts & connections"], ["import", "Import CSV"]];
const METRICS = [["views", "Views"], ["likes", "Likes"], ["comments", "Comments"], ["shares", "Shares"], ["saves", "Saves"], ["watchTimeSec", "Watch time (sec)"]];

const blankPost = () => ({
  platform: "facebook", externalId: "", title: "", url: "", postedAt: new Date().toLocaleDateString("en-CA"),
  views: "", likes: "", comments: "", shares: "", saves: "", watchTimeSec: "", algorithmScore: "",
});

function PostForm({ initial, editing, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      // A manual post with no platform ID gets a stable generated one.
      const externalId = form.externalId.trim() || `manual-${Date.now().toString(36)}`;
      // An unchanged date keeps the original timestamp; a new date is stored
      // as midday Singapore time so the calendar day never shifts.
      const { originalPostedAt, originalDate, ...post } = form;
      const postedAt = originalPostedAt && form.postedAt === originalDate ? originalPostedAt : `${form.postedAt}T12:00:00+08:00`;
      await saveSocialPosts([{ ...post, externalId, postedAt }], "manual");
      toast.success(editing ? "Post updated." : "Post added.");
      onSaved();
    } catch (err) {
      setError(err.message || "Unable to save this post.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={editing ? "Edit post" : "Add post"}>
      <form onSubmit={submit} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border-subtle bg-card p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink">{editing ? "Edit post" : "Add a post"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-subtle hover:bg-page hover:text-ink" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {error && <p className="mb-4 rounded-xl bg-active p-3 text-sm text-primary">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold text-muted">Platform
            <select value={form.platform} onChange={set("platform")} disabled={editing || saving} className={field}>
              {PLATFORM_KEYS.map((key) => <option key={key} value={key}>{PLATFORMS[key].label}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">Post / video ID
            <input value={form.externalId} onChange={set("externalId")} disabled={editing || saving} placeholder="Leave blank to generate" className={field} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted sm:col-span-2">Title or caption
            <input value={form.title} onChange={set("title")} disabled={saving} maxLength={300} className={field} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">Link
            <input type="url" value={form.url} onChange={set("url")} disabled={saving} placeholder="https://…" className={field} />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">Posted on
            <input type="date" value={form.postedAt} onChange={set("postedAt")} disabled={saving} required className={field} />
          </label>
          {METRICS.map(([key, label]) => (
            <label key={key} className="grid gap-1 text-xs font-bold text-muted">{label}
              <input type="number" min="0" step="1" value={form[key]} onChange={set(key)} disabled={saving} placeholder="0" className={field} />
            </label>
          ))}
          <label className="grid gap-1 text-xs font-bold text-muted sm:col-span-2">Algorithm score (optional, 0–100)
            <input type="number" min="0" max="100" step="0.1" value={form.algorithmScore} onChange={set("algorithmScore")} disabled={saving} placeholder="Leave blank to calculate automatically" className={field} />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl px-4 py-2.5 text-sm font-bold text-muted hover:bg-page">Cancel</button>
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? "Save changes" : "Add post"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PostsTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [form, setForm] = useState(null); // { initial, editing }

  const load = () => loadSocialPosts()
    .then((result) => { setPosts(result.posts || []); setError(""); })
    .catch((err) => setError(err.message || "Unable to load posts."));
  useEffect(() => { void Promise.resolve().then(load); }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (posts || []).filter((post) => (platform === "all" || post.platform === platform)
      && (!term || `${post.title} ${post.externalId}`.toLowerCase().includes(term)));
  }, [posts, search, platform]);

  function edit(post) {
    setForm({
      editing: true,
      initial: {
        ...post,
        postedAt: sgtDate(Date.parse(post.postedAt)),
        originalDate: sgtDate(Date.parse(post.postedAt)),
        originalPostedAt: post.postedAt,
        algorithmScore: post.algorithmScore ?? "",
        ...Object.fromEntries(METRICS.map(([key]) => [key, String(post[key] ?? "")])),
      },
    });
  }

  function remove(post) {
    return confirm({
      title: "Delete post",
      message: `Remove "${post.title || post.externalId}" from the dashboard? If it came from an automatic sync it will come back on the next sync.`,
      tone: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        await deleteSocialPost(post.id);
        toast.success("Post deleted.");
        await load();
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-subtle" aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or ID…" className={`${field} pl-9`} />
        </label>
        <select value={platform} onChange={(event) => setPlatform(event.target.value)} className={`${field} w-auto`} aria-label="Platform">
          <option value="all">All platforms</option>
          {PLATFORM_KEYS.map((key) => <option key={key} value={key}>{PLATFORMS[key].label}</option>)}
        </select>
        <button type="button" onClick={() => setForm({ editing: false, initial: blankPost() })} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover">
          <Plus className="h-4 w-4" aria-hidden="true" /> Add post
        </button>
      </div>

      {error && <p className="rounded-xl bg-active p-3 text-sm text-primary">{error}</p>}
      {!posts && !error && <p className="flex items-center gap-2 py-8 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading posts…</p>}
      {posts && (
        <div className="overflow-x-auto rounded-2xl border border-border-subtle">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="bg-page text-[10px] uppercase tracking-wider text-muted">
              <tr>
                <th className="px-3 py-2.5">Post</th>
                <th className="px-3 py-2.5">Posted</th>
                <th className="px-3 py-2.5 text-right">Views</th>
                <th className="px-3 py-2.5 text-right">Likes</th>
                <th className="px-3 py-2.5 text-right">Comments</th>
                <th className="px-3 py-2.5">Source</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {!visible.length && <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-muted">{posts.length ? "No posts match." : "No posts yet — add one or import a CSV."}</td></tr>}
              {visible.slice(0, 300).map((post) => (
                <tr key={post.id} className="hover:bg-page">
                  <td className="max-w-80 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <PlatformMark platform={post.platform} size="sm" />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{post.title || "(untitled)"}</span>
                        <span className="font-mono text-[10px] text-subtle">{post.externalId}</span>
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted">{formatPostDate(post.postedAt)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-ink">{compact(post.views)}</td>
                  <td className="px-3 py-2.5 text-right text-muted">{compact(post.likes)}</td>
                  <td className="px-3 py-2.5 text-right text-muted">{compact(post.comments)}</td>
                  <td className="px-3 py-2.5 capitalize text-muted">{post.source}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button type="button" onClick={() => edit(post)} className="rounded-lg p-1.5 text-subtle hover:bg-info-soft hover:text-info" aria-label="Edit post"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => remove(post)} className="rounded-lg p-1.5 text-subtle hover:bg-active hover:text-primary" aria-label="Delete post"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length > 300 && <p className="border-t border-border-subtle px-3 py-2 text-xs text-muted">Showing the 300 most recent of {visible.length} — search or filter to narrow down.</p>}
        </div>
      )}

      {form && (
        <PostForm
          key={form.initial.id || "new"}
          initial={form.initial}
          editing={form.editing}
          onClose={() => setForm(null)}
          onSaved={() => { setForm(null); void load(); }}
        />
      )}
    </div>
  );
}

function AccountCard({ row, connected, syncResult }) {
  const toast = useToast();
  const meta = PLATFORMS[row.platform];
  const [form, setForm] = useState({ followers: row.followers ?? "", handle: row.handle || "", url: row.url || "" });
  const [saving, setSaving] = useState(false);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function save() {
    setSaving(true);
    try {
      await saveSocialAccount({ platform: row.platform, ...form });
      toast.success(`${meta.label} account saved.`);
    } catch (err) {
      toast.error(err.message || "Unable to save this account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <PlatformMark platform={row.platform} />
          <div>
            <h4 className="font-bold text-ink">{meta.label}</h4>
            <p className="text-[11px] text-muted">{row.accountUpdatedAt ? `Updated ${formatSyncTime(row.accountUpdatedAt)} SGT` : "Not set up yet"}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold ${connected ? "bg-success-soft text-success" : "bg-page text-muted"}`}>
          {connected ? <CheckCircle2 className="h-3 w-3" /> : <Plug className="h-3 w-3" />}{connected ? "Auto-sync on" : "Manual"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-[11px] font-bold text-muted">Followers
          <input type="number" min="0" step="1" value={form.followers} onChange={set("followers")} disabled={saving} className={field} />
        </label>
        <label className="grid gap-1 text-[11px] font-bold text-muted">Handle / name
          <input value={form.handle} onChange={set("handle")} disabled={saving} placeholder="@nextacademy" className={field} />
        </label>
        <label className="grid gap-1 text-[11px] font-bold text-muted">Profile link
          <input type="url" value={form.url} onChange={set("url")} disabled={saving} placeholder="https://…" className={field} />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-muted">
          {connected
            ? syncResult?.status === "error"
              ? <span className="text-primary">Last sync failed: {syncResult.message}</span>
              : "Followers and posts are refreshed on every sync — manual edits here are overwritten."
            : <>Auto-sync needs <code className="rounded bg-page px-1 font-mono text-[10px]">{ENV_VARS[row.platform].join(", ")}</code> in the server environment.</>}
        </p>
        <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl border border-border-subtle px-4 py-2 text-xs font-bold text-ink hover:bg-page disabled:opacity-60">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save
        </button>
      </div>
    </article>
  );
}

function ImportTab() {
  const toast = useToast();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setResult(null);
    setFileName(file.name);
    setRows(postsFromCsv(await file.text()));
  }

  const valid = rows.filter((row) => isPlatform(row.platform));
  const counts = PLATFORM_KEYS.map((key) => [key, valid.filter((row) => row.platform === key).length]).filter(([, count]) => count);

  async function runImport() {
    setBusy(true);
    try {
      let saved = 0;
      const errors = [];
      for (let i = 0; i < rows.length; i += 2000) {
        const chunk = rows.slice(i, i + 2000);
        try {
          const response = await saveSocialPosts(chunk, "import");
          saved += response.saved;
          errors.push(...(response.errors || []).map((item) => ({ ...item, row: item.row + i })));
        } catch (err) {
          const details = err.details?.errors;
          if (details) errors.push(...details.map((item) => ({ ...item, row: item.row + i })));
          else throw err;
        }
      }
      setResult({ saved, errors });
      if (saved) toast.success(`Imported ${saved} post${saved === 1 ? "" : "s"}.`);
      if (errors.length) toast.warning(`${errors.length} row${errors.length === 1 ? "" : "s"} skipped — see the list below.`);
    } catch (err) {
      toast.error(err.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const example = ["instagram", "C8x1AbCdEf", "2026-10-01", "Open day highlights", "https://www.instagram.com/p/C8x1AbCdEf/", "5400", "320", "41", "12", "30", "", ""];
    const blob = new Blob([`${CSV_COLUMNS.join(",")}\r\n${example.join(",")}\r\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "social-media-import-template.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-border-subtle bg-page p-6 text-center">
        <FileUp className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
        <p className="mt-2 text-sm font-bold text-ink">Import posts from a CSV file</p>
        <p className="mx-auto mt-1 max-w-xl text-xs text-muted">
          One row per post. Columns: <code className="font-mono text-[10px]">{CSV_COLUMNS.join(", ")}</code>. Re-importing the same platform + ID updates that post instead of duplicating it,
          and a file exported from this dashboard can be edited and imported back.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={choose} className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-60">Choose CSV file</button>
          <button type="button" onClick={downloadTemplate} className="rounded-xl border border-border-subtle bg-card px-4 py-2 text-xs font-bold text-ink hover:bg-active">Download template</button>
        </div>
      </div>

      {fileName && (
        <div className="rounded-2xl border border-border-subtle p-5">
          <p className="text-sm font-bold text-ink">{fileName}</p>
          <p className="mt-1 text-xs text-muted">
            {rows.length} row{rows.length === 1 ? "" : "s"} found
            {counts.length > 0 && ` · ${counts.map(([key, count]) => `${PLATFORMS[key].label} ${count}`).join(", ")}`}
            {rows.length - valid.length > 0 && <span className="text-primary"> · {rows.length - valid.length} with an unknown platform</span>}
          </p>
          <button type="button" onClick={runImport} disabled={busy || !rows.length} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-hover disabled:opacity-60">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Import {rows.length} row{rows.length === 1 ? "" : "s"}
          </button>
          {result && (
            <div className="mt-4 text-xs">
              <p className="font-bold text-success">{result.saved} saved</p>
              {result.errors.length > 0 && (
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-xl bg-active p-3 text-primary">
                  {result.errors.slice(0, 100).map((item) => <li key={`${item.row}-${item.message}`}>Line {item.row + 1}: {item.message}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ManageSocialData({ initialTab = "posts", connectors, lastSync, byPlatform, onBack }) {
  const [tab, setTab] = useState(TABS.some(([key]) => key === initialTab) ? initialTab : "posts");
  return (
    <div className="space-y-6">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-xs font-bold text-muted transition hover:text-primary">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to dashboard
      </button>
      <header>
        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Social Media Performance</p>
        <h2 className="mt-1 text-2xl font-black text-ink">Manage data</h2>
        <p className="mt-1 text-sm text-muted">Add or correct posts, set follower counts, and import platform exports.</p>
      </header>
      <div className="flex flex-wrap gap-2" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-xs font-bold transition ${tab === key ? "bg-primary text-white" : "bg-page text-muted hover:bg-active hover:text-primary"}`}>
            {label}
          </button>
        ))}
      </div>
      <section className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm md:p-6">
        {tab === "posts" && <PostsTab />}
        {tab === "import" && <ImportTab />}
        {tab === "accounts" && (
          <div className="space-y-4">
            <div className="rounded-xl bg-info-soft p-4 text-xs text-info">
              <b>Automatic sync.</b> When a platform&apos;s API credentials are set on the server, &quot;Sync now&quot; pulls the last 12 months of posts and the follower count.
              Add <code className="font-mono">CRON_SECRET</code> and point a daily Cloud Scheduler job at <code className="font-mono">/api/cron/social-media-sync</code> to sync every night.
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {PLATFORM_KEYS.map((platform) => {
                const row = byPlatform.find((item) => item.platform === platform) || { platform, followers: null };
                return <AccountCard key={platform} row={row} connected={Boolean(connectors[platform])} syncResult={lastSync?.platforms?.[platform]} />;
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
