"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Link2, Pencil, Plus, Trash2, Users } from "lucide-react";
import { deleteForm, loadForms, setFormStatus } from "../../lib/services/forms-service";
import { formLink } from "../../lib/forms-shared";
import { useToast } from "../ui/Toast";
import { useConfirm } from "../ui/ConfirmDialog";
import FormBuilder from "./FormBuilder";
import FormResponses from "./FormResponses";

// Director / Admin "Forms" tab — build a Google-Forms-style form, share its
// link with students, and see who has filled it in.
export default function FormsView() {
  const toast = useToast();
  const confirm = useConfirm();
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [builder, setBuilder] = useState(null); // null | "new" | form
  const [viewing, setViewing] = useState(null);
  const [copiedId, setCopiedId] = useState("");

  const load = () => {
    loadForms()
      .then((data) => { setForms(data.forms || []); setError(""); })
      .catch((err) => setError(err.message || "Unable to load forms."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { void Promise.resolve().then(load); }, []);

  async function copyLink(form) {
    try {
      await navigator.clipboard.writeText(formLink(window.location.origin, form.id));
      setCopiedId(form.id);
      setTimeout(() => setCopiedId(""), 1500);
    } catch {
      toast.error("Couldn't copy — open the form's responses page to copy the link.");
    }
  }

  async function toggleStatus(form) {
    const next = form.status === "open" ? "closed" : "open";
    try {
      await setFormStatus(form.id, next);
      toast.success(next === "open" ? "Form is open for responses." : "Form closed.");
      load();
    } catch (err) {
      toast.error(err.message || "Unable to update this form.");
    }
  }

  function remove(form) {
    return confirm({
      title: "Delete form",
      message: `Delete "${form.title}" and all ${form.responseCount || 0} responses? This cannot be undone.`,
      tone: "danger",
      confirmLabel: "Delete",
      onConfirm: async () => {
        await deleteForm(form.id);
        toast.success("Form deleted.");
        load();
      },
    });
  }

  if (viewing) {
    // Re-resolve from the list so edits made elsewhere show up.
    const live = forms.find((f) => f.id === viewing.id) || viewing;
    return <FormResponses form={live} onBack={() => { setViewing(null); load(); }} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Surveys</p>
          <h2 className="mt-1 text-2xl font-black text-ink">Forms</h2>
          <p className="mt-1 text-xs text-muted">Create a form, send its link to students, and see who has filled it in.</p>
        </div>
        <button type="button" onClick={() => setBuilder("new")} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white shadow-sm">
          <Plus className="h-4 w-4" aria-hidden="true" /> Create Form
        </button>
      </div>

      {error && <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading forms…</p>
      ) : !forms.length ? (
        <div className="rounded-2xl border border-dashed border-border-subtle bg-card p-10 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-subtle" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-ink/70">No forms yet — create your first one.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => (
            <article key={form.id} className="flex flex-col justify-between rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
              <div>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-base font-bold text-ink">{form.title}</h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${form.status === "open" ? "bg-success-soft text-success" : "bg-page text-muted"}`}>{form.status}</span>
                </div>
                {form.description && <p className="line-clamp-2 text-xs text-ink/70">{form.description}</p>}
                <p className="mt-3 text-xs font-semibold text-muted">
                  {(form.questions || []).filter((q) => q.type !== "section").length} questions
                  {form.closesAt && <span className="font-normal"> · {form.status === "open" ? "closes" : "closed"} after {form.closesAt}</span>}
                </p>
              </div>
              <div className="mt-4 space-y-3 border-t border-border-subtle pt-4">
                <button type="button" onClick={() => setViewing(form)} className="flex w-full items-center justify-between rounded-xl bg-active px-3 py-2 text-xs font-bold text-primary">
                  <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" aria-hidden="true" /> Responses</span>
                  <span>{form.responseCount || 0}</span>
                </button>
                <div className="flex items-center justify-between gap-2 text-xs font-bold">
                  <button type="button" onClick={() => copyLink(form)} className="inline-flex items-center gap-1 text-primary hover:underline">
                    <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> {copiedId === form.id ? "Copied" : "Copy link"}
                  </button>
                  <button type="button" onClick={() => toggleStatus(form)} className="text-ink hover:underline">{form.status === "open" ? "Close" : "Reopen"}</button>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setBuilder(form)} title="Edit form" className="rounded-lg p-1.5 text-subtle hover:bg-active hover:text-primary"><Pencil className="h-3.5 w-3.5" aria-hidden="true" /></button>
                    <button type="button" onClick={() => remove(form)} title="Delete form" className="rounded-lg p-1.5 text-subtle hover:bg-active hover:text-primary"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {builder && (
        <FormBuilder
          initial={builder === "new" ? null : builder}
          onClose={() => setBuilder(null)}
          onSaved={() => {
            toast.success("Form saved.");
            setBuilder(null);
            load();
          }}
        />
      )}
    </div>
  );
}
