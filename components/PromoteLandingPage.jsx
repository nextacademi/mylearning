"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  loadPromotionLink,
  recordPromotionClick,
  submitPromotionLead,
} from "../lib/services/promote-service";

export default function PromoteLandingPage() {
  const { slug } = useParams();
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!slug) return;
    loadPromotionLink(slug)
      .then((data) => {
        setLink(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [slug]);

  async function reveal() {
    setShowForm(true);
    recordPromotionClick(slug).catch(() => {});
  }

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError("");
    try {
      await submitPromotionLead(slug, form);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 p-4 text-slate-800">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-card p-8 shadow-sm">
        {loading ? (
          <p className="text-center text-sm text-slate-500">Loading...</p>
        ) : error ? (
          <p className="text-center text-sm text-red-600">{error}</p>
        ) : (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-600">
              Next Academy · {link.teacherName}
            </p>
            <h1 className="mt-3 text-2xl font-black md:text-3xl">{link.courseTitle}</h1>
            <p className="mt-3 text-sm text-slate-600">
              {link.courseDescription || "Join this training program."}
            </p>

            {submitted ? (
              <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700">
                Thanks! Your interest has been registered — the team will reach out soon.
              </div>
            ) : !showForm ? (
              <button
                onClick={reveal}
                className="mt-6 w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white"
              >
                Register interest
              </button>
            ) : (
              <form onSubmit={submit} className="mt-6 grid gap-3">
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Full name"
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-500"
                />
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="Email address"
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-500"
                />
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="Phone (optional)"
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-500"
                />
                <textarea
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  placeholder="Message (optional)"
                  className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-500"
                  rows={3}
                />
                {submitError && <p className="text-xs text-red-600">{submitError}</p>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-red-600 py-3 text-sm font-bold text-white disabled:opacity-40"
                >
                  {submitting ? "Submitting..." : "Submit registration"}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </main>
  );
}
