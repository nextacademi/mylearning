// Shared (client + server) definitions for the public "Training
// Registration" flow: the homepage course cards, the registration form's
// options and limits, and the payment-details shape. No imports, so the
// public page, the Website editor and the API routes all agree.

// Card colour themes (header / price strip / accent text). Picked from a
// list in the Website editor instead of free hex values, so every card
// stays in the site's red family.
export const COURSE_COLORS = {
  rose: { label: "Rose", header: "#BE123C", price: "#9F1239", accent: "#BE123C" },
  crimson: { label: "Crimson", header: "#B91C1C", price: "#991B1B", accent: "#B91C1C" },
  red: { label: "Red", header: "#E31B23", price: "#E31B23", accent: "#E31B23" },
  ruby: { label: "Ruby", header: "#BE123C", price: "#881337", accent: "#BE123C" },
  coral: { label: "Coral", header: "#C2410C", price: "#92400E", accent: "#C2410C" },
  dark: { label: "Dark", header: "#1F2937", price: "#111827", accent: "#374151" },
};

// Card artwork presets (rendered with lucide icons on the homepage).
export const COURSE_ICONS = {
  office: "Office apps (W · X · P + laptop)",
  excel: "Excel (sheet + chart)",
  autocad: "AutoCAD (A + drafting compass)",
  ai: "AI (robot + sparkles)",
  wpln: "Language (headphones + book)",
  general: "General (graduation cap)",
};

export const COURSE_LIMITS = { title: 80, duration: 40, schedule: 40, tagline: 60 };
export const MAX_COURSE_PRICE = 100000;

// The five courses from the November 2026 brief — used until an admin
// edits the list in Dashboard → Website → Courses.
export const DEFAULT_COURSES = [
  { id: "basic-computer", title: "Basic Computer Course", duration: "3 Months", schedule: "Every Sunday", price: 298, color: "rose", icon: "office", tagline: "" },
  { id: "advance-excel", title: "Advance Excel", duration: "10 Weeks", schedule: "Every Sunday", price: 300, color: "crimson", icon: "excel", tagline: "" },
  { id: "basic-autocad", title: "Basic AutoCAD", duration: "10 Weeks", schedule: "Every Sunday", price: 295, color: "red", icon: "autocad", tagline: "Drafting & Design", featured: true },
  { id: "ai-learning", title: "AI Learning", duration: "2 Days", schedule: "Every Sunday", price: 98, color: "ruby", icon: "ai", tagline: "ChatGPT & GenAI" },
  { id: "wpln-preparatory", title: "WPLN Preparatory", duration: "8 Weeks", schedule: "Every Sunday", price: 295, color: "coral", icon: "wpln", tagline: "WPLN Assessment Prep" },
];

export const EDUCATION_OPTIONS = [
  "Primary / Secondary School",
  "ITE / Nitec / Higher Nitec",
  "Diploma / Advanced Diploma",
  "Bachelor's Degree",
  "Postgraduate / Master's / PhD",
  "Other",
];

// Payment details shown in the form (Dashboard → Website → Payment details).
export const PAYMENT_FIELDS = {
  paynowQr: 500,
  paynowUen: 40,
  bankName: 80,
  accountName: 120,
  accountNumber: 40,
  note: 300,
};

// The payment block only appears once there is something real to pay to:
// a PayNow QR or UEN, or a bank name + account number.
export function paymentConfigured(payment) {
  if (!payment) return false;
  return Boolean(payment.paynowQr || payment.paynowUen || (payment.bankName && payment.accountNumber));
}

export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
export const RECEIPT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif";

export const REGISTRATION_LIMITS = { name: 100, title: 100, email: 160, whatsapp: 30, company: 120 };
export const REGISTRATION_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Digits with optional +, spaces, dashes, dots and brackets; 8–15 digits.
export function validWhatsapp(value) {
  if (typeof value !== "string" || !/^[+\d\s().-]+$/.test(value.trim())) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export const formatPrice = (value) => {
  const amount = Number(value) || 0;
  return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
};

export const REGISTRATION_STATUSES = ["pending", "approved", "rejected"];
