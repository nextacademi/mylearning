import { FieldValue } from "firebase-admin/firestore";

// The member agreement shown once on sign-in (components/onboarding/
// OnboardingGate.jsx) and edited by Admin/Director in Website → Agreement.
// Stored at settings/agreement. Acceptance is recorded on the member's own
// users/{uid}.agreementAccepted = { version, at } — raising the version in
// the editor makes everyone it applies to accept again.
//
// Section bodies are plain text: a blank line starts a new paragraph and
// lines starting with "- " become bullet points.

const ROLES = ["Guest", "Student", "Volunteer", "Teacher", "Facilitator", "Admin", "Director"];

export const DEFAULT_AGREEMENT = {
  enabled: true,
  title: "Student & Volunteer Agreement",
  version: "v1.01",
  effectiveDate: "2026-07-01",
  subtitle: "Please read the agreement below. You must accept once before using Next Academy.",
  checkboxLabel: "I have read and agree to the Next Academy Student & Volunteer Agreement, including the Code of Conduct, data protection (PDPA), and media use provisions.",
  roles: ["Guest", "Student", "Volunteer"],
  sections: [
    {
      heading: "1. Introduction",
      body: "Welcome to Next Academy.\n\nNext Academy is a social impact organisation committed to empowering communities through education, leadership development, volunteerism, digital literacy, and humanitarian initiatives.\n\nTo provide a safe, respectful, and professional learning environment, every student, volunteer, trainer, facilitator, leader, and participant is required to comply with this Code of Conduct and Discipline Policy.\n\nBy registering with Next Academy, you acknowledge that you have read, understood, and agreed to comply with this Agreement throughout your involvement with the organisation.\n\nThis policy applies to:\n- Students\n- Volunteers\n- Ambassadors\n- Trainers and facilitators",
    },
    {
      heading: "2. Code of Conduct",
      body: "- Treat everyone with respect, courtesy and fairness.\n- Attend sessions on time and inform your trainer if you cannot attend.\n- Follow the instructions of trainers, facilitators and event leaders.\n- Harassment, discrimination, bullying or misconduct of any kind will not be tolerated.",
    },
    {
      heading: "3. Data Protection (PDPA)",
      body: "Next Academy collects and uses your personal data (such as your name, contact details and attendance) only to run its trainings, events and volunteer programmes, in line with Singapore's Personal Data Protection Act (PDPA).\n\nYou may ask to view or correct your personal data at any time.",
    },
    {
      heading: "4. Photos & Media",
      body: "Photos and videos may be taken at trainings and events and used for Next Academy's reports, website and social media. Tell the organiser if you prefer not to be photographed.",
    },
  ],
};

const ref = (db) => db.collection("settings").doc("agreement");
const str = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export async function getAgreement(db) {
  const snap = await ref(db).get();
  if (!snap.exists) return DEFAULT_AGREEMENT;
  const data = snap.data();
  return { ...DEFAULT_AGREEMENT, ...data, sections: Array.isArray(data.sections) && data.sections.length ? data.sections : DEFAULT_AGREEMENT.sections };
}

export const appliesTo = (agreement, role) => Boolean(agreement.enabled) && (agreement.roles || []).includes(role || "Guest");
export const hasAccepted = (agreement, user) => user?.agreementAccepted?.version === agreement.version;

export async function saveAgreement(db, body, updatedBy) {
  const sections = (Array.isArray(body.sections) ? body.sections : [])
    .map((s) => ({ heading: str(s?.heading, 200), body: str(s?.body, 20000) }))
    .filter((s) => s.heading || s.body)
    .slice(0, 40);
  const agreement = {
    enabled: body.enabled !== false,
    title: str(body.title, 200) || DEFAULT_AGREEMENT.title,
    version: str(body.version, 40) || DEFAULT_AGREEMENT.version,
    effectiveDate: /^\d{4}-\d{2}-\d{2}$/.test(body.effectiveDate || "") ? body.effectiveDate : "",
    subtitle: str(body.subtitle, 500),
    checkboxLabel: str(body.checkboxLabel, 600) || DEFAULT_AGREEMENT.checkboxLabel,
    roles: (Array.isArray(body.roles) ? body.roles : []).filter((r) => ROLES.includes(r)),
    sections,
  };
  if (!agreement.sections.length) throw Object.assign(new Error("Add at least one section."), { statusCode: 400 });
  await ref(db).set({ ...agreement, updatedBy, updatedAt: FieldValue.serverTimestamp() });
  return agreement;
}

export async function acceptAgreement(db, uid, version) {
  const agreement = await getAgreement(db);
  if (version !== agreement.version) throw Object.assign(new Error("The agreement was just updated — please read the new version."), { statusCode: 409 });
  await db.collection("users").doc(uid).update({
    agreementAccepted: { version: agreement.version, at: FieldValue.serverTimestamp() },
  });
  return { version: agreement.version };
}

// How many of the members it applies to have accepted the current version.
export async function acceptanceStats(db, agreement) {
  const snap = await db.collection("users").get();
  const members = snap.docs.map((d) => d.data()).filter((u) => (agreement.roles || []).includes(u.role || "Guest") && u.active !== false);
  return { members: members.length, accepted: members.filter((u) => hasAccepted(agreement, u)).length };
}
