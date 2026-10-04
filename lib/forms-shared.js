// Google-Forms-style survey forms: shared by the admin builder, the student
// fill page, and the server-side validation in lib/server/forms-core.js.
export const QUESTION_TYPES = [
  { id: "short", label: "Short answer" },
  { id: "paragraph", label: "Paragraph" },
  { id: "choice", label: "Multiple choice (pick one)" },
  { id: "checkbox", label: "Checkboxes (pick many)" },
  { id: "dropdown", label: "Dropdown" },
  { id: "scale", label: "Linear scale" },
  { id: "date", label: "Date" },
  { id: "time", label: "Time" },
];
export const OPTION_TYPES = ["choice", "checkbox", "dropdown"];
// Types that can offer a free-text "Other" entry (a dropdown can't).
export const OTHER_TYPES = ["choice", "checkbox"];
export const OTHER_PREFIX = "Other: ";
export const MAX_QUESTIONS = 50;
export const MAX_OPTIONS = 30;
export const DEFAULT_SCALE = { min: 1, max: 5, lowLabel: "", highLabel: "" };

export const newQuestionId = () => `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
export const blankQuestion = () => ({ id: newQuestionId(), type: "short", label: "", help: "", required: false, options: [], other: false, scale: { ...DEFAULT_SCALE } });
export const formLink = (origin, id) => `${origin}/forms/${id}`;
