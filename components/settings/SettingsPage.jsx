"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { Award, Camera, Check, Contact, Download, Moon, Sun, X } from "lucide-react";
import { useAuth } from "../../lib/auth-context";
import { useTheme } from "../../lib/theme-context";
import {
  deleteMyAccount,
  subscribeMyCertificates,
  updateMyProfile,
  uploadProfilePhoto,
  validateAvatarFile,
} from "../../lib/profile-data";
import IdCardPrint from "../teacher/IdCardPrint";

const genders = ["Prefer not to say", "Male", "Female", "Other"];
const raceOptions = ["Asian", "Black / African", "Hispanic / Latino", "Middle Eastern", "White / Caucasian", "Mixed", "Other", "Prefer not to say"];
const religionOptions = ["Buddhism", "Christianity", "Hinduism", "Islam", "Judaism", "Sikhism", "No religion", "Other", "Prefer not to say"];
const bloodGroupOptions = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Don't know"];
const nationalityOptions = [
  "Afghanistan", "Albania", "Algeria", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
  "Bahrain", "Bangladesh", "Belarus", "Belgium", "Bhutan", "Bolivia", "Bosnia and Herzegovina", "Brazil",
  "Brunei", "Bulgaria", "Cambodia", "Cameroon", "Canada", "Chile", "China", "Colombia", "Croatia", "Cuba",
  "Cyprus", "Czech Republic", "Denmark", "Ecuador", "Egypt", "Estonia", "Ethiopia", "Fiji", "Finland",
  "France", "Georgia", "Germany", "Ghana", "Greece", "Hong Kong", "Hungary", "Iceland", "India",
  "Indonesia", "Iran", "Iraq", "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan",
  "Kenya", "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lithuania", "Luxembourg", "Malaysia",
  "Maldives", "Malta", "Mexico", "Moldova", "Monaco", "Mongolia", "Morocco", "Myanmar", "Nepal",
  "Netherlands", "New Zealand", "Nigeria", "North Korea", "Norway", "Oman", "Pakistan", "Palestine",
  "Panama", "Papua New Guinea", "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia",
  "Rwanda", "Saudi Arabia", "Serbia", "Singapore", "Slovakia", "Slovenia", "South Africa", "South Korea",
  "Spain", "Sri Lanka", "Sudan", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania",
  "Thailand", "Tunisia", "Turkey", "Turkmenistan", "Uganda", "Ukraine", "United Arab Emirates",
  "United Kingdom", "United States", "Uruguay", "Uzbekistan", "Venezuela", "Vietnam", "Yemen", "Other",
];

// ---------------------------------------------------------------------------
// Reusable Framer Motion variants (defined once, shared by every animated
// element below) — MotionConfig's reducedMotion="user" wrapper further down
// automatically strips transform-based motion (the y/scale offsets here)
// when the visitor has prefers-reduced-motion on, without any manual
// branching in each variant.
// ---------------------------------------------------------------------------
const EASE = [0.22, 1, 0.36, 1];

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

const fadeSlideUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

// Right-column cards: entrance target doubles as the hover "rest" position —
// whileHover="hover" lifts them, and un-hovering settles back to `show`.
const liftCard = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
  hover: { y: -4, boxShadow: "0 16px 32px -12px rgba(15,23,42,0.18)", transition: { duration: 0.2, ease: "easeOut" } },
};

// Form sections (Personal details / Background / Emergency contact / About
// you) reveal as they scroll into view, not just once on page load.
const revealOnView = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

const modalBackdrop = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

const modalPanel = {
  hidden: { opacity: 0, scale: 0.95, y: 12 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.25, ease: EASE } },
  exit: { opacity: 0, scale: 0.97, y: 8, transition: { duration: 0.15 } },
};

// Native :focus transitions are plain CSS (border/ring/shadow), not Framer
// Motion — the browser already drives focus timing correctly and a CSS
// transition is smoother here than re-rendering on every keystroke would be.
const FIELD_CLASS =
  "rounded-xl border border-border-subtle bg-page px-3 py-2.5 text-sm font-semibold text-ink outline-none transition-all duration-200 focus:border-primary focus:ring-4 focus:ring-primary/15";

function initialsFrom(name) {
  return (name || "?").trim().slice(0, 2).toUpperCase();
}

function Field({ label, className = "", ...props }) {
  return (
    <label className={`grid gap-1 text-xs font-bold text-muted ${className}`}>
      {label}
      <input {...props} className={FIELD_CLASS} />
    </label>
  );
}

function Select({ label, value, onChange, options, placeholder }) {
  return (
    <label className="grid gap-1 text-xs font-bold text-muted">
      {label}
      <select value={value} onChange={onChange} className={FIELD_CLASS}>
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Section({ icon, title, subtitle, children }) {
  return (
    <motion.div
      className="border-b border-border-subtle py-5 last:border-0"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.3 }}
      variants={revealOnView}
    >
      <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-subtle">
        <span aria-hidden="true">{icon}</span>
        {title}
      </p>
      {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{children}</div>
    </motion.div>
  );
}

function emptyForm(profile) {
  return {
    displayName: profile?.displayName || "",
    phone: profile?.phone || "",
    dateOfBirth: profile?.dateOfBirth || "",
    gender: profile?.gender || "",
    address: profile?.address || "",
    raceEthnicity: profile?.raceEthnicity || "",
    nationality: profile?.nationality || "",
    religion: profile?.religion || "",
    bloodGroup: profile?.bloodGroup || "",
    emergencyContactName: profile?.emergencyContactName || "",
    emergencyContactPhone: profile?.emergencyContactPhone || "",
    about: profile?.about || "",
    interests: (profile?.interests || []).join(", "),
  };
}

export default function SettingsPage() {
  const { user, profile, refreshProfile, logout } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const router = useRouter();
  const [showIdCard, setShowIdCard] = useState(false);
  const [certificates, setCertificates] = useState([]);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [notifSaving, setNotifSaving] = useState(false);
  const [toast, setToast] = useState("");

  const name = profile?.displayName || user?.displayName || user?.email?.split("@")[0] || "Member";
  // Defense-in-depth only — a pending/rejected Student can't actually reach
  // Settings at all, since app/dashboard/[role]/page.jsx's central gate
  // blocks the whole dashboard first. This just keeps this page honest if
  // it's ever reached some other way.
  const isBlocked = profile?.status === "pending" || profile?.status === "rejected";
  const notificationsEnabled = profile?.notificationsEnabled !== false;

  // ---- Inline profile form state (always editable, no separate modal) ----
  const [form, setForm] = useState(() => emptyForm(profile));
  const [dirty, setDirty] = useState(false);
  // Re-sync the form when the underlying profile object changes (e.g. after
  // refreshProfile() following a save) — but only while the user hasn't made
  // unsaved local edits, so a live Firestore update never clobbers what
  // they're typing. Direct setState-during-render, React's own recommended
  // pattern for "adjusting state when a prop changes" (not an effect, since
  // there's no external system to synchronize with here).
  const [syncedProfile, setSyncedProfile] = useState(profile);
  if (profile !== syncedProfile && !dirty) {
    setSyncedProfile(profile);
    setForm(emptyForm(profile));
  }
  function set(field) {
    return (event) => {
      setDirty(true);
      setForm((current) => ({ ...current, [field]: event.target.value }));
    };
  }
  function cancelEdits() {
    setForm(emptyForm(profile));
    setDirty(false);
    setError("");
    setPhotoFile(null);
    setPhotoPreview("");
    setPhotoRemoved(false);
    setPhotoError("");
  }

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // Profile photo: a real file upload, not a URL. `photoFile` is a
  // newly-picked File (uploaded on Save); `photoRemoved` means the user
  // cleared the existing photo. Neither touches the existing photoURL until
  // Save succeeds.
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    if (!photoPreview) return undefined;
    return () => URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const currentPhoto = photoPreview || (photoRemoved ? "" : profile?.photoURL || "");

  function handlePhotoSelect(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const invalid = validateAvatarFile(file);
    if (invalid) {
      setPhotoError(invalid);
      return;
    }
    setPhotoError("");
    setPhotoRemoved(false);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setDirty(true);
  }

  function handlePhotoRemove() {
    setPhotoFile(null);
    setPhotoPreview("");
    setPhotoRemoved(true);
    setPhotoError("");
    setDirty(true);
  }

  // ---- Delete account (destructive — needs an explicit second step) ----
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleDeleteAccount() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteMyAccount();
      await logout?.();
      router.replace("/");
    } catch (err) {
      setDeleteError(err.message || "Unable to delete your account.");
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (!user?.uid) return undefined;
    return subscribeMyCertificates(user.uid, setCertificates, () => {});
  }, [user?.uid]);

  useEffect(() => {
    function handler(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function toggleNotifications() {
    if (!user?.uid || notifSaving) return;
    setNotifSaving(true);
    try {
      const next = !notificationsEnabled;
      await updateMyProfile(user.uid, { notificationsEnabled: next });
      setToast(next ? "🔔 Notifications turned on" : "🔕 Notifications turned off");
      setTimeout(() => setToast(""), 2500);
    } finally {
      setNotifSaving(false);
    }
  }

  async function handleInstall() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  async function handleSave() {
    if (saving || !user?.uid) return;
    if (!form.displayName.trim()) {
      setError("Full name cannot be empty.");
      return;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      let photoURL = profile?.photoURL || "";
      let photoPath = profile?.photoPath || "";
      if (photoFile) {
        setUploadingPhoto(true);
        try {
          ({ photoURL, photoPath } = await uploadProfilePhoto(user.uid, photoFile));
        } finally {
          setUploadingPhoto(false);
        }
      } else if (photoRemoved) {
        photoURL = "";
        photoPath = "";
      }
      await updateMyProfile(user.uid, {
        displayName: form.displayName.trim(),
        phone: form.phone.trim(),
        photoURL,
        photoPath,
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        address: form.address.trim(),
        raceEthnicity: form.raceEthnicity.trim(),
        nationality: form.nationality.trim(),
        religion: form.religion.trim(),
        bloodGroup: form.bloodGroup.trim(),
        emergencyContactName: form.emergencyContactName.trim(),
        emergencyContactPhone: form.emergencyContactPhone.trim(),
        about: form.about.trim(),
        interests: form.interests
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setPhotoFile(null);
      setPhotoPreview("");
      setPhotoRemoved(false);
      setDirty(false);
      setSaved(true);
      await refreshProfile?.();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message || "Unable to save your profile.");
    } finally {
      setSaving(false);
    }
  }

  const saveLabel = uploadingPhoto ? "uploading" : saving ? "saving" : saved ? "saved" : "idle";

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6 rounded-3xl bg-page p-1">
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -16, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: -12, x: "-50%" }}
              transition={{ duration: 0.25, ease: EASE }}
              className="fixed left-1/2 top-4 z-[60] rounded-full bg-ink px-4 py-2 text-xs font-bold text-white shadow-lg"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        <h2 className="px-1 text-2xl font-bold text-ink">Settings</h2>

        <motion.div
          className="grid gap-6 lg:grid-cols-[1.4fr_1fr]"
          initial="hidden"
          animate="show"
          variants={staggerContainer}
        >
          {/* LEFT COLUMN — always-editable profile form */}
          <motion.div variants={fadeSlideUp} className="space-y-6">
            <div className="rounded-2xl border border-border-subtle bg-card p-4 shadow-sm sm:p-6">
              <div className="flex items-center gap-4">
                <div className="relative shrink-0">
                  {currentPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={currentPhoto} alt={name} className="h-16 w-16 rounded-full object-cover" />
                  ) : (
                    <span className="grid h-16 w-16 place-items-center rounded-full bg-primary text-lg font-bold text-white">
                      {initialsFrom(form.displayName || name)}
                    </span>
                  )}
                  <label className="absolute -bottom-1 -right-1 grid h-6 w-6 cursor-pointer place-items-center rounded-full border-2 border-[var(--settings-card,#ffffff)] bg-ink text-white shadow-sm transition-colors hover:bg-primary">
                    <Camera className="h-3 w-3" aria-hidden="true" />
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handlePhotoSelect}
                      disabled={saving}
                      className="hidden"
                    />
                  </label>
                </div>
                <div className="min-w-0 flex-1">
                  <b className="block text-lg text-ink">Your Profile</b>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    {user?.email}
                  </span>
                  {currentPhoto && (
                    <button type="button" onClick={handlePhotoRemove} disabled={saving} className="mt-0.5 text-[11px] font-bold text-primary hover:underline disabled:opacity-50">
                      Remove photo
                    </button>
                  )}
                  {photoError && <span className="mt-0.5 block text-[10px] font-semibold text-primary">{photoError}</span>}
                </div>
              </div>

              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, height: 0, marginTop: 0 }}
                    animate={{ opacity: 1, height: "auto", marginTop: 16 }}
                    exit={{ opacity: 0, height: 0, marginTop: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden rounded-xl bg-active p-3 text-xs font-semibold text-primary"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              <Section icon="👤" title="Personal details" subtitle="Basic information used on your member profile and ID card.">
                <div className="sm:col-span-2">
                  <Field label="Full name" value={form.displayName} onChange={set("displayName")} />
                </div>
                <label className="grid gap-1 text-xs font-bold text-muted">
                  Phone number
                  <div className="flex gap-2">
                    <span className="flex shrink-0 items-center rounded-xl border border-border-subtle bg-page px-2.5 text-sm text-ink">+65</span>
                    <input
                      value={form.phone}
                      onChange={set("phone")}
                      placeholder="Your mobile number"
                      className={`w-full ${FIELD_CLASS}`}
                    />
                  </div>
                </label>
                <label className="grid gap-1 text-xs font-bold text-muted">
                  Gender
                  <select value={form.gender} onChange={set("gender")} className={FIELD_CLASS}>
                    <option value="">Prefer not to say</option>
                    {genders.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </label>
                <Field label="Date of birth" type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} />
                <div className="sm:col-span-2">
                  <Field label="Home address" value={form.address} onChange={set("address")} placeholder="Block, street, postal code" />
                </div>
              </Section>

              <Section icon="🌐" title="Background" subtitle="Choose from the list. Pick Others to type your own answer.">
                <Select label="Race / Ethnicity" value={form.raceEthnicity} onChange={set("raceEthnicity")} options={raceOptions} placeholder="Select race" />
                <Select label="Nationality / Citizenship" value={form.nationality} onChange={set("nationality")} options={nationalityOptions} placeholder="Select nationality" />
                <Select label="Religion" value={form.religion} onChange={set("religion")} options={religionOptions} placeholder="Select religion" />
                <Select label="Blood group" value={form.bloodGroup} onChange={set("bloodGroup")} options={bloodGroupOptions} placeholder="Select blood group" />
              </Section>

              <Section icon="📇" title="Emergency contact" subtitle="Someone we can call if there is an emergency at an event.">
                <Field label="Contact name" value={form.emergencyContactName} onChange={set("emergencyContactName")} placeholder="e.g. spouse, parent, friend" />
                <Field label="Contact number" value={form.emergencyContactPhone} onChange={set("emergencyContactPhone")} placeholder="Mobile number" />
              </Section>

              <Section icon="✨" title="About you" subtitle="Tell others a little about yourself and what you enjoy.">
                <div className="sm:col-span-2">
                  <label className="grid gap-1 text-xs font-bold text-muted">
                    About me
                    <textarea
                      value={form.about}
                      onChange={set("about")}
                      rows={3}
                      placeholder="A short introduction about yourself"
                      className={FIELD_CLASS}
                    />
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <Field label="Interests (comma separated)" value={form.interests} onChange={set("interests")} placeholder="Teaching, Environment, Youth" />
                </div>
              </Section>

              <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <span className="w-fit rounded-full bg-active px-3 py-1 text-xs font-semibold text-primary">
                  Your role: {profile?.role || "—"}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={cancelEdits}
                    disabled={saving || !dirty}
                    className="rounded-xl border border-border-subtle px-4 py-2.5 text-xs font-bold text-muted transition-colors hover:bg-page disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <motion.button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    whileHover={saving ? undefined : { scale: 1.02 }}
                    whileTap={saving ? undefined : { scale: 0.97 }}
                    className={`flex min-w-[128px] items-center justify-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-bold text-white transition-colors disabled:opacity-70 ${saved ? "bg-success" : "bg-primary hover:bg-primary-hover"}`}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={saveLabel}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="inline-flex items-center gap-1.5"
                      >
                        {saveLabel === "saved" && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                        {saveLabel === "uploading" ? "Uploading photo..." : saveLabel === "saving" ? "Saving..." : saveLabel === "saved" ? "Changes saved" : "Save changes"}
                      </motion.span>
                    </AnimatePresence>
                  </motion.button>
                  <button
                    type="button"
                    onClick={() => setConfirmingDelete(true)}
                    disabled={saving}
                    className="rounded-xl border border-red-line px-4 py-2.5 text-xs font-bold text-primary transition-colors hover:bg-active disabled:opacity-50"
                  >
                    Delete account
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* RIGHT COLUMN */}
          <motion.div variants={staggerContainer} className="space-y-6">
            <motion.div variants={liftCard} whileHover="hover" className="rounded-2xl border border-border-subtle bg-card p-6 shadow-sm">
              <b className="flex items-center gap-2 text-sm text-ink">
                <Award className="h-4 w-4 text-primary" aria-hidden="true" />
                My Certificates
              </b>
              {certificates.length ? (
                <motion.div initial="hidden" animate="show" variants={staggerContainer} className="mt-3 space-y-2">
                  {certificates.map((cert) => (
                    <motion.div key={cert.id} variants={fadeSlideUp} whileHover={{ x: 2 }} className="rounded-xl border border-border-subtle p-3 text-xs">
                      <b className="block text-ink">{cert.title || "Certificate"}</b>
                      <span className="text-muted">{cert.status || "Issued"}</span>
                    </motion.div>
                  ))}
                </motion.div>
              ) : (
                <p className="mt-2 text-xs text-muted">
                  No certificates yet. Complete events or trainings to earn certificates.
                </p>
              )}
            </motion.div>

            {/* ID Card / check-in QR: Student, Teacher, and Director — every
                Student needs their own check-in QR for events/training
                attendance. Dropped only for Volunteer/Admin (see roleConfig
                in app/dashboard/[role]/page.jsx). */}
            {["Student", "Teacher", "Director"].includes(profile?.role) && (
              isBlocked ? (
                <motion.div variants={liftCard} className="rounded-2xl border border-border-subtle bg-page p-5">
                  <b className="block text-sm text-ink">ID Card</b>
                  <p className="mt-1 text-xs text-muted">
                    🔒 ID Card unavailable — your ID Card will become available after your account is approved.
                  </p>
                </motion.div>
              ) : (
                <motion.button
                  type="button"
                  onClick={() => setShowIdCard(true)}
                  variants={liftCard}
                  whileHover="hover"
                  whileTap={{ scale: 0.98 }}
                  className="flex w-full items-center gap-3 rounded-2xl border border-red-line bg-active p-5 text-left shadow-sm"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card text-primary">
                    <Contact className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span>
                    <b className="block text-sm text-primary">View your ID Card</b>
                    <span className="text-xs text-muted">Open your digital member card and check-in QR for events.</span>
                  </span>
                </motion.button>
              )
            )}

            <motion.div variants={liftCard} whileHover="hover" className="rounded-2xl border border-border-subtle bg-card p-6 shadow-sm">
              <b className="text-sm text-ink">App Settings</b>

              <div className="mt-4 flex items-center justify-between gap-4 border-b border-border-subtle pb-4">
                <div>
                  <p className="text-xs font-semibold text-ink">Theme</p>
                  <p className="text-[10px] text-muted">Switch between light and dark mode</p>
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="flex items-center gap-1.5 overflow-hidden rounded-lg border border-border-subtle px-3 py-1.5 text-xs font-bold text-ink transition-colors"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={dark ? "dark" : "light"}
                      initial={{ opacity: 0, rotate: -90, scale: 0.6 }}
                      animate={{ opacity: 1, rotate: 0, scale: 1 }}
                      exit={{ opacity: 0, rotate: 90, scale: 0.6 }}
                      transition={{ duration: 0.25, ease: EASE }}
                      className="flex items-center gap-1.5"
                    >
                      {dark ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                      {dark ? "Dark" : "Light"}
                    </motion.span>
                  </AnimatePresence>
                </button>
              </div>

              <div className="mt-4 flex items-center justify-between gap-4 border-b border-border-subtle pb-4">
                <div>
                  <p className="text-xs font-semibold text-ink">Notifications</p>
                  <p className="text-[10px] text-muted">
                    Show unread badges for your notifications
                  </p>
                </div>
                <motion.button
                  type="button"
                  onClick={toggleNotifications}
                  disabled={notifSaving}
                  whileTap={{ scale: 0.94 }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-60 ${notificationsEnabled ? "border-info bg-info-soft text-info" : "border-border-subtle text-muted"}`}
                >
                  {notificationsEnabled ? "Enabled" : "Disabled"}
                </motion.button>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-ink">Install App</p>
                    <p className="text-[10px] text-muted">Install Next Academy as a standalone app</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleInstall}
                    disabled={!installPrompt}
                    className="flex items-center gap-1.5 rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white transition-colors disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Install
                  </button>
                </div>
                {!installPrompt && (
                  <p className="mt-2 rounded-lg bg-page p-2 text-[10px] text-muted">
                    Use your browser&apos;s menu → &quot;Install app&quot; or &quot;Add to Home Screen&quot;
                  </p>
                )}
              </div>
            </motion.div>

            <motion.div variants={liftCard} whileHover="hover" className="rounded-2xl border border-border-subtle bg-card p-6 shadow-sm">
              <b className="text-sm text-ink">Account</b>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Email</p>
                  <p className="text-sm text-ink">{user?.email || "Not set"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Title</p>
                  <p className="text-sm text-ink">{profile?.role || "Not set"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Member ID</p>
                  <p className="text-sm text-ink">{profile?.userId || "Not set"}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-subtle">Account Status</p>
                  {profile?.status === "pending" ? (
                    <span className="mt-1 inline-block rounded-full bg-warning-soft px-2.5 py-1 text-[10px] font-bold text-warning">
                      🟠 Pending Approval
                    </span>
                  ) : profile?.status === "rejected" ? (
                    <span className="mt-1 inline-block rounded-full bg-active px-2.5 py-1 text-[10px] font-bold text-primary">
                      🔴 Registration Rejected
                    </span>
                  ) : (
                    <span
                      className={`mt-1 inline-block rounded-full px-2.5 py-1 text-[10px] font-bold ${profile?.active === false ? "bg-active text-primary" : "bg-success-soft text-success"}`}
                    >
                      {profile?.active === false ? "inactive" : "🟢 active"}
                    </span>
                  )}
                  {isBlocked && <p className="mt-1.5 text-[10px] text-muted">Account is not active yet.</p>}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>

        <AnimatePresence>
          {confirmingDelete && (
            <motion.div
              className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
              initial="hidden"
              animate="show"
              exit="exit"
              variants={modalBackdrop}
            >
              <motion.div variants={modalPanel} className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-2xl">
                <b className="block text-sm text-ink">Delete your account?</b>
                <p className="mt-2 text-xs text-muted">
                  This permanently deletes your login and profile. This cannot be undone. Your academic history
                  (enrollments, submissions, certificates) stays on record.
                </p>
                {deleteError && <p className="mt-3 rounded-xl bg-active p-2.5 text-xs font-semibold text-primary">{deleteError}</p>}
                <div className="mt-4 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmingDelete(false);
                      setDeleteError("");
                    }}
                    disabled={deleting}
                    className="rounded-xl px-4 py-2.5 text-xs font-bold text-muted disabled:opacity-50"
                  >
                    Keep my account
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {deleting ? "Deleting..." : "Yes, delete my account"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showIdCard && (
            <motion.div
              className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
              initial="hidden"
              animate="show"
              exit="exit"
              variants={modalBackdrop}
              onClick={(event) => {
                if (event.target === event.currentTarget) setShowIdCard(false);
              }}
            >
              <motion.div variants={modalPanel} className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-card p-6 shadow-2xl sm:p-8">
                <button
                  type="button"
                  onClick={() => setShowIdCard(false)}
                  className="absolute right-4 top-4 rounded-lg p-1.5 text-muted transition-colors hover:bg-page hover:text-ink"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
                <div className="mb-6 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-[.2em] text-primary">Digital Membership</p>
                  <h3 className="mt-1 text-2xl font-black text-ink sm:text-3xl">Your ID Card</h3>
                  <p className="mx-auto mt-2 max-w-md text-xs text-muted sm:text-sm">
                    Keep this ready at events and training — first scan checks you in, second scan checks you out and credits your hours.
                  </p>
                </div>
                <IdCardPrint
                  mode="self"
                  roleLabel={profile?.role || "Member"}
                  fallbackName={name}
                  fallbackEmail={user?.email}
                  photoURL={profile?.photoURL}
                  active={profile?.active}
                  status={profile?.status}
                  onEditProfile={() => setShowIdCard(false)}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
