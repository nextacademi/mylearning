// Google-Forms-style survey forms: shared by the admin builder, the student
// fill page, and the server-side validation in lib/server/forms-core.js.
export const QUESTION_TYPES = [
  { id: "short", label: "Short answer" },
  { id: "paragraph", label: "Paragraph" },
  { id: "choice", label: "Multiple choice (pick one)" },
  { id: "checkbox", label: "Checkboxes (pick many)" },
  { id: "dropdown", label: "Dropdown" },
  { id: "scale", label: "Linear scale" },
  { id: "rating", label: "Rating (stars)" },
  { id: "grid", label: "Multiple choice grid" },
  { id: "checkgrid", label: "Checkbox grid" },
  { id: "date", label: "Date" },
  { id: "time", label: "Time" },
  { id: "section", label: "Section header (title & description only)" },
];
export const OPTION_TYPES = ["choice", "checkbox", "dropdown"];
// Types that can offer a free-text "Other" entry (a dropdown can't).
export const OTHER_TYPES = ["choice", "checkbox"];
// Rows × columns question types. Answers are stored as an object keyed by
// row index ("0", "1", …) — grid: one column label per row; checkgrid: an
// array of column labels per row (Firestore can't store nested arrays).
export const GRID_TYPES = ["grid", "checkgrid"];
// Display-only blocks — never answered, never required.
export const NO_ANSWER_TYPES = ["section"];
export const OTHER_PREFIX = "Other: ";
export const MAX_QUESTIONS = 50;
export const MAX_OPTIONS = 30;
export const MAX_GRID_ROWS = 20;
export const MAX_GRID_COLUMNS = 10;
export const DEFAULT_SCALE = { min: 1, max: 5, lowLabel: "", highLabel: "" };
export const DEFAULT_RATING_MAX = 5;

// Short-answer response validation (Google Forms' "Response validation").
export const VALIDATIONS = [
  { id: "", label: "Any text" },
  { id: "email", label: "Email address" },
  { id: "number", label: "Number" },
  { id: "url", label: "Link (URL)" },
  { id: "phone", label: "Phone number" },
];
// Returns an error message, or "" when the value is acceptable. Shared so
// the fill page and the server reject exactly the same input.
export function validateShortAnswer(validation, value) {
  const text = String(value ?? "").trim();
  if (!text || !validation) return "";
  if (validation === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "Enter a valid email address.";
  if (validation === "number" && !/^-?\d+(\.\d+)?$/.test(text)) return "Enter a number.";
  if (validation === "url" && !/^https?:\/\/\S+\.\S+/i.test(text)) return "Enter a link starting with http:// or https://.";
  if (validation === "phone" && !/^\+?[\d\s()-]{6,20}$/.test(text)) return "Enter a valid phone number.";
  return "";
}

export const newQuestionId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const blankQuestion = () => ({
  id: newQuestionId(), type: "short", label: "", help: "", required: false, options: [], other: false,
  scale: { ...DEFAULT_SCALE }, rows: [], columns: [], validation: "", shuffle: false,
});
export const formLink = (origin, id) => `${origin}/forms/${id}`;

// Human-readable answer for the responses table / CSV.
export function formatFormAnswer(question, value) {
  if (value == null || value === "") return "";
  if (GRID_TYPES.includes(question?.type) && typeof value === "object" && !Array.isArray(value)) {
    return (question.rows || [])
      .map((row, index) => {
        const picked = value[String(index)];
        const text = Array.isArray(picked) ? picked.join(", ") : picked;
        return text ? `${row}: ${text}` : "";
      })
      .filter(Boolean)
      .join("; ");
  }
  if (question?.type === "rating") return `${value} / ${question.scale?.max || DEFAULT_RATING_MAX}`;
  return Array.isArray(value) ? value.join(", ") : String(value);
}
