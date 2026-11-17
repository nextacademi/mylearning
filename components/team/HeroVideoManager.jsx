"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { loadHeroVideo, saveHeroVideo } from "../../lib/services/site-content-service";
import { HERO_VIDEO_DEFAULTS, HERO_VIDEO_LIMITS } from "../../lib/hero-video";
import HeroSlideshow from "../brand/HeroSlideshow";
import { useToast } from "../ui/Toast";
import PhotoField from "./PhotoField";

// Website → Hero video: the slideshow beside the homepage headline. Photos
// and text for each part, in order, with a live preview. Switching it off
// shows the fixed intro video file instead.
const inputClass = "mt-1 w-full rounded-lg border border-border-subtle bg-card px-3 py-2.5 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-primary";
const L = HERO_VIDEO_LIMITS;

function Section({ title, show, onShow, children, hint }) {
  return (
    <div className="space-y-4 rounded-xl border border-border-subtle bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-ink">{title}</h3>
          {hint && <p className="text-[11px] text-muted">{hint}</p>}
        </div>
        {onShow && (
          <label className="flex items-center gap-2 text-xs font-bold text-muted">
            <input type="checkbox" checked={show} onChange={(event) => onShow(event.target.checked)} className="h-4 w-4 accent-[#e31b23]" />
            Show
          </label>
        )}
      </div>
      {(show || !onShow) && children}
    </div>
  );
}

function Text({ label, value, max, onChange, placeholder }) {
  return (
    <label className="block text-xs font-bold text-muted">{label}
      <input value={value || ""} maxLength={max} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className={inputClass} />
    </label>
  );
}

export default function HeroVideoManager() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  useEffect(() => {
    loadHeroVideo()
      .then((data) => setForm(data.heroVideo || HERO_VIDEO_DEFAULTS))
      .catch((err) => setError(err.message || "Unable to load."));
    fetch("/api/site-content")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setCourses(Array.isArray(data?.courses) ? data.courses : null))
      .catch(() => {});
  }, []);

  const set = (part, key) => (value) => setForm((current) => ({ ...current, [part]: { ...current[part], [key]: value } }));
  const setSlide = (index, key) => (value) =>
    setForm((current) => ({ ...current, slides: current.slides.map((slide, i) => (i === index ? { ...slide, [key]: value } : slide)) }));
  const moveSlide = (index, direction) =>
    setForm((current) => {
      const slides = [...current.slides];
      const target = index + direction;
      if (target < 0 || target >= slides.length) return current;
      [slides[index], slides[target]] = [slides[target], slides[index]];
      return { ...current, slides };
    });
  const removeSlide = (index) => setForm((current) => ({ ...current, slides: current.slides.filter((_, i) => i !== index) }));
  const addSlide = () => setForm((current) => ({ ...current, slides: [...current.slides, { photo: "", label: "", caption: "" }] }));

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await saveHeroVideo(form);
      setForm(data.heroVideo);
      setPreviewKey((value) => value + 1);
      toast.success("Hero video saved. The homepage is updated.");
    } catch (err) {
      toast.error(err.message || "Unable to save.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="rounded-lg bg-active px-4 py-3 text-sm text-primary">{error}</p>;
  if (!form) return <p className="text-sm text-muted">Loading…</p>;

  // Preview only slides that already have a photo and caption.
  const preview = { ...form, slides: form.slides.filter((slide) => slide.photo && slide.caption) };

  return (
    <form onSubmit={save} className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">The moving picture beside the homepage headline. Change photos, text and order; the preview updates as you type.</p>
        <label className="flex items-center gap-2 rounded-lg border border-border-subtle bg-card px-3 py-2 text-xs font-bold text-ink">
          <input type="checkbox" checked={form.enabled !== false} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} className="h-4 w-4 accent-[#e31b23]" />
          Use this slideshow (off = the fixed intro video)
        </label>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_minmax(0,520px)]">
        <div className="space-y-5">
          <Section title="1. Intro (logo)" show={form.intro.show !== false} onShow={set("intro", "show")} hint="The academy logo with a light sweep.">
            <Text label="Line under the logo" value={form.intro.text} max={L.introText} onChange={set("intro", "text")} placeholder="PROFESSIONAL TRAINING · SINGAPORE" />
          </Section>

          <Section title={`2. Photo slides (${form.slides.length}/${L.maxSlides})`} hint="Each photo slowly zooms in with its caption.">
            {form.slides.map((slide, index) => (
              <div key={index} className="space-y-3 rounded-lg border border-border-subtle bg-page/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-xs text-ink">Slide {index + 1}</b>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => moveSlide(index, -1)} disabled={index === 0} aria-label="Move up" className="rounded-md p-1.5 text-muted hover:bg-card disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" onClick={() => moveSlide(index, 1)} disabled={index === form.slides.length - 1} aria-label="Move down" className="rounded-md p-1.5 text-muted hover:bg-card disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                    <button type="button" onClick={() => removeSlide(index)} aria-label={`Remove slide ${index + 1}`} className="rounded-md p-1.5 text-primary hover:bg-active"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
                <PhotoField label="Photo" value={slide.photo} onChange={setSlide(index, "photo")} placeholder="Upload, or paste https://…" inputClassName={inputClass} />
                <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
                  <Text label="Small red label" value={slide.label} max={L.label} onChange={setSlide(index, "label")} placeholder="HANDS-ON TRAINING" />
                  <Text label="Caption" value={slide.caption} max={L.caption} onChange={setSlide(index, "caption")} placeholder="Learn with real trainers" />
                </div>
              </div>
            ))}
            {form.slides.length < L.maxSlides && (
              <button type="button" onClick={addSlide} className="inline-flex items-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-xs font-bold text-primary hover:bg-active">
                <Plus className="h-4 w-4" aria-hidden="true" /> Add photo slide
              </button>
            )}
          </Section>

          <Section title="3. Course list" show={form.courses.show !== false} onShow={set("courses", "show")} hint="Course names come from the Courses tab; the photo is shown blurred behind them.">
            <Text label="Label" value={form.courses.label} max={L.coursesLabel} onChange={set("courses", "label")} placeholder="OUR COURSES" />
            <PhotoField label="Background photo" value={form.courses.photo} onChange={set("courses", "photo")} placeholder="Upload, or paste https://…" inputClassName={inputClass} />
          </Section>

          <Section title="4. End card" show={form.end.show !== false} onShow={set("end", "show")} hint="Logo, heading and a button that jumps to the course cards.">
            <div className="grid gap-3 sm:grid-cols-3">
              <Text label="Heading" value={form.end.heading} max={L.endHeading} onChange={set("end", "heading")} placeholder="Join our next batch" />
              <Text label="Button" value={form.end.button} max={L.endButton} onChange={set("end", "button")} placeholder="Register now" />
              <Text label="Website text" value={form.end.website} max={L.endWebsite} onChange={set("end", "website")} placeholder="nextacademy.sg" />
            </div>
            <PhotoField label="Background photo" value={form.end.photo} onChange={set("end", "photo")} placeholder="Upload, or paste https://…" inputClassName={inputClass} />
          </Section>
        </div>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <p className="mb-2 text-xs font-bold text-muted">Live preview</p>
          {form.enabled !== false ? (
            <HeroSlideshow key={previewKey} config={preview} courses={courses} className="aspect-video w-full rounded-lg ring-1 ring-border-subtle" />
          ) : (
            <p className="rounded-lg border border-dashed border-border-subtle p-6 text-center text-xs text-muted">Slideshow is off — the homepage shows the fixed intro video.</p>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setForm(HERO_VIDEO_DEFAULTS)} className="rounded-lg px-4 py-2.5 text-sm font-bold text-muted hover:bg-active">Reset to default</button>
            <button disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save hero video"}</button>
          </div>
        </div>
      </div>
    </form>
  );
}
