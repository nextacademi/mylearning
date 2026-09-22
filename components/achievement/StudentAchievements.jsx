"use client";

import { useEffect, useState } from "react";
import { Award, Download, ShieldCheck, Trophy } from "lucide-react";
import { subscribeMyAchievements, subscribeMyCertificates, downloadCertificatePdf } from "../../lib/achievement-data";

// "MY ACHIEVEMENTS" — Awards on the left, Certificates on the right, same
// concept the app already used in Settings' small "My Certificates" panel,
// now as its own full page. Purely a read-only display: there is no
// "Request"/"Apply"/"Generate" button anywhere here — every certificate
// shown already exists because the existing course-completion check
// (lib/server/certificate-core.js) issued it automatically.
export default function StudentAchievements({ uid }) {
  const [achievements, setAchievements] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [downloadingId, setDownloadingId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid) return undefined;
    const unsubA = subscribeMyAchievements(uid, setAchievements, () => setError("Unable to load achievements."));
    const unsubC = subscribeMyCertificates(uid, setCertificates, () => setError("Unable to load certificates."));
    return () => {
      unsubA();
      unsubC();
    };
  }, [uid]);

  async function download(cert) {
    setDownloadingId(cert.id);
    try {
      const blob = await downloadCertificatePdf(cert.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      setError(err.message || "Unable to download this certificate.");
    } finally {
      setDownloadingId("");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#f3aaaa] bg-[linear-gradient(120deg,#fff0f0_0%,#fff7f7_45%,#ffffff_100%)] p-4 shadow-sm md:p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Achievement</p>
        <h2 className="mt-2 text-lg font-black text-ink">My Achievements</h2>
        <p className="mt-1 text-xs text-muted">Awards you&apos;ve earned and certificates automatically issued when you complete a course.</p>
      </section>

      {error && <p className="rounded-xl bg-active p-4 text-sm text-primary">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-ink">
            <Trophy className="h-4 w-4 text-primary" aria-hidden="true" /> Awards
          </h3>
          {achievements.length ? (
            <div className="space-y-3">
              {achievements.map((item) => (
                <div key={item.id} className="rounded-xl border border-border-subtle p-4">
                  <b className="block text-sm text-ink">{item.title}</b>
                  {item.description && <p className="mt-1 text-xs text-muted">{item.description}</p>}
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-subtle">{item.type ? item.type.replace(/_/g, " ") : "Achievement"}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No awards yet — keep learning to earn your first one.</p>
          )}
        </section>

        <section className="rounded-2xl border border-border-subtle bg-card p-5 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-ink">
            <Award className="h-4 w-4 text-primary" aria-hidden="true" /> Certificates
          </h3>
          {certificates.length ? (
            <div className="space-y-3">
              {certificates.map((cert) => (
                <div key={cert.id} className="rounded-xl border border-border-subtle p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <b className="block text-sm text-ink">{cert.title || cert.metadata?.courseName || "Certificate"}</b>
                      <p className="mt-1 font-mono text-[11px] text-subtle">{cert.certificateCode || cert.id}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${cert.status === "revoked" ? "bg-active text-primary" : "bg-success-soft text-success"}`}>
                      {cert.status === "revoked" ? "Revoked" : "Active"}
                    </span>
                  </div>
                  {cert.status !== "revoked" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => download(cert)}
                        disabled={downloadingId === cert.id}
                        className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                      >
                        <Download className="h-3 w-3" aria-hidden="true" /> {downloadingId === cert.id ? "Preparing..." : "Download PDF"}
                      </button>
                      <a
                        href={`/verify/${encodeURIComponent(cert.certificateCode || cert.id)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 rounded-lg border border-border-subtle px-3 py-1.5 text-[11px] font-bold text-ink hover:bg-active"
                      >
                        <ShieldCheck className="h-3 w-3" aria-hidden="true" /> Verify
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No certificates yet. Complete a certificate-enabled course to earn one automatically.</p>
          )}
        </section>
      </div>
    </div>
  );
}
