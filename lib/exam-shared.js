// ---------------------------------------------------------------------------
// Pure helpers shared by the Model Test (quiz) builder, the student take-test
// view and the exam import. No Firebase, no React — safe on client and server.
//
// Reading passages: a quiz may carry `passages: [{ id, title, instructions,
// body }]` (plain text; blank lines separate paragraphs). A question points at
// one with an optional `passageId`; questions that share a passage are shown
// under it as one group. Passages hold no answers, so they live on the public
// quiz doc next to `questions`.
// ---------------------------------------------------------------------------

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;
export const MAX_QUESTION_TEXT = 500;
export const MAX_OPTION_TEXT = 200;
export const MAX_TITLE = 160;
export const MAX_DESCRIPTION = 1000;
export const MAX_PASSAGE_TITLE = 160;
export const MAX_PASSAGE_INSTRUCTIONS = 1000;
export const MAX_PASSAGE_BODY = 12000;
export const MAX_IMPORT_EXAMS = 50;
export const MAX_IMPORT_QUESTIONS = 200;

export const EXAM_IMPORT_FORMAT = "next-academy-exams";

export function newPassageId() {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const text = (value) => (typeof value === "string" ? value : "");

// Keeps only well-formed passages, trims them, and gives each a stable id.
export function normalizePassages(passages) {
  if (!Array.isArray(passages)) return [];
  const seen = new Set();
  const out = [];
  passages.forEach((passage) => {
    if (!passage || typeof passage !== "object") return;
    const title = text(passage.title).trim();
    const instructions = text(passage.instructions).trim();
    const body = text(passage.body).replace(/\r\n?/g, "\n").trim();
    if (!title && !instructions && !body) return;
    let id = text(passage.id).trim() || newPassageId();
    while (seen.has(id)) id = newPassageId();
    seen.add(id);
    out.push({ id, title, instructions, body });
  });
  return out;
}

// Paragraphs of a passage body: split on blank lines; single line breaks
// inside a paragraph are kept (rendered with whitespace-pre-line).
export function passageParagraphs(body) {
  return text(body).replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

// Questions in order, grouped by consecutive passageId — what the take-test
// and result views render. A question whose passage no longer exists is shown
// without one. `number` is the 1-based question number across the whole quiz.
export function groupQuestionsByPassage(questions, passages) {
  const byId = new Map((passages || []).map((p) => [p.id, p]));
  const groups = [];
  (questions || []).forEach((question, index) => {
    const passage = question.passageId ? byId.get(question.passageId) || null : null;
    const last = groups[groups.length - 1];
    if (last && (last.passage?.id || null) === (passage?.id || null)) {
      last.items.push({ question, number: index + 1 });
    } else {
      groups.push({ passage, items: [{ question, number: index + 1 }] });
    }
  });
  const passageCount = groups.filter((g) => g.passage).length;
  let part = 0;
  groups.forEach((g) => {
    if (g.passage) {
      part += 1;
      g.part = part;
      g.partCount = passageCount;
    }
  });
  return groups;
}

// The short link a student scans (QR on the staff exam card): /exam/<quizId>
// sends them through log-in to their Model Test tab with that exam opened.
export const examPath = (quizId) => `/exam/${encodeURIComponent(quizId)}`;
export const EXAM_LINK_PARAM = "exam";

// Numeric-aware title sort, so "Mock Test 2" comes before "Mock Test 10".
export function compareQuizTitles(a, b) {
  return String(a?.title || "").localeCompare(String(b?.title || ""), undefined, { numeric: true, sensitivity: "base" });
}

// ---------------------------------------------------------------------------
// Exam import file:
// { "format": "next-academy-exams", "version": 1, "exams": [ {
//     "title", "description"?, "timeLimitMinutes"?, "maxAttempts"?,
//     "passages"?: [{ "id", "title"?, "instructions"?, "body"? }],
//     "questions": [{ "text", "options": [..], "correctOptionIndex", "points"?, "passageId"? }]
// } ] }
// Returns { exams, errors }: `exams` are ready for createQuiz (course/module
// are picked in the dialog); any error means nothing should be imported.
// ---------------------------------------------------------------------------
export function parseExamImport(raw) {
  const errors = [];
  let data = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return { exams: [], errors: ["This is not a valid JSON file."] };
    }
  }
  if (!data || typeof data !== "object" || data.format !== EXAM_IMPORT_FORMAT) {
    return { exams: [], errors: [`This is not a Next Academy exam file (expected "format": "${EXAM_IMPORT_FORMAT}").`] };
  }
  if (data.version !== 1) return { exams: [], errors: ["Unsupported exam file version."] };
  if (!Array.isArray(data.exams) || !data.exams.length) return { exams: [], errors: ["The file has no exams."] };
  if (data.exams.length > MAX_IMPORT_EXAMS) return { exams: [], errors: [`Import at most ${MAX_IMPORT_EXAMS} exams at a time.`] };

  const exams = data.exams.map((exam, examIndex) => {
    const where = `Exam ${examIndex + 1}`;
    const fail = (message) => errors.push(`${where}: ${message}`);
    if (!exam || typeof exam !== "object") {
      fail("not an object.");
      return null;
    }
    const title = text(exam.title).trim();
    if (!title) fail("title is missing.");
    else if (title.length > MAX_TITLE) fail(`title is longer than ${MAX_TITLE} characters.`);
    const description = text(exam.description).trim();
    if (description.length > MAX_DESCRIPTION) fail(`description is longer than ${MAX_DESCRIPTION} characters.`);

    const rawPassages = Array.isArray(exam.passages) ? exam.passages : [];
    rawPassages.forEach((p, i) => {
      if (!p || typeof p !== "object" || !text(p.id).trim()) fail(`passage ${i + 1} needs an "id".`);
      else {
        if (text(p.title).length > MAX_PASSAGE_TITLE) fail(`passage ${i + 1} title is too long.`);
        if (text(p.instructions).length > MAX_PASSAGE_INSTRUCTIONS) fail(`passage ${i + 1} instructions are too long.`);
        if (text(p.body).length > MAX_PASSAGE_BODY) fail(`passage ${i + 1} text is longer than ${MAX_PASSAGE_BODY} characters.`);
      }
    });
    const passageIds = rawPassages.map((p) => text(p?.id).trim());
    if (new Set(passageIds).size !== passageIds.length) fail("two passages share the same id.");
    const passages = normalizePassages(rawPassages);
    const known = new Set(passages.map((p) => p.id));

    const rawQuestions = Array.isArray(exam.questions) ? exam.questions : [];
    if (!rawQuestions.length) fail("has no questions.");
    if (rawQuestions.length > MAX_IMPORT_QUESTIONS) fail(`has more than ${MAX_IMPORT_QUESTIONS} questions.`);
    const questions = rawQuestions.map((q, i) => {
      const qWhere = `question ${i + 1}`;
      const qText = text(q?.text).trim();
      if (!qText) fail(`${qWhere} has no text.`);
      else if (qText.length > MAX_QUESTION_TEXT) fail(`${qWhere} is longer than ${MAX_QUESTION_TEXT} characters.`);
      const options = Array.isArray(q?.options) ? q.options.map((o) => text(o).trim()) : [];
      if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) fail(`${qWhere} needs ${MIN_OPTIONS}–${MAX_OPTIONS} options.`);
      if (options.some((o) => !o)) fail(`${qWhere} has an empty option.`);
      if (options.some((o) => o.length > MAX_OPTION_TEXT)) fail(`${qWhere} has an option longer than ${MAX_OPTION_TEXT} characters.`);
      if (new Set(options).size !== options.length) fail(`${qWhere} repeats an option.`);
      const correct = q?.correctOptionIndex;
      if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) fail(`${qWhere} has no valid correct answer.`);
      const points = q?.points == null ? 1 : Number(q.points);
      if (!(points > 0)) fail(`${qWhere} has invalid points.`);
      const passageId = text(q?.passageId).trim();
      if (passageId && !known.has(passageId)) fail(`${qWhere} points at a passage that does not exist.`);
      return { text: qText, options, correctOptionIndex: correct, points, ...(passageId ? { passageId } : {}) };
    });

    const timeLimit = exam.timeLimitMinutes == null || exam.timeLimitMinutes === "" ? "" : Number(exam.timeLimitMinutes);
    if (timeLimit !== "" && !(timeLimit > 0)) fail("time limit must be a positive number of minutes.");
    const maxAttempts = exam.maxAttempts == null ? 1 : Number(exam.maxAttempts);
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) fail("attempts allowed must be 1 or more.");

    return {
      title,
      description,
      timeLimitMinutes: timeLimit,
      maxAttempts,
      passages,
      questions,
      totalPoints: questions.reduce((sum, q) => sum + (q.points > 0 ? q.points : 0), 0),
    };
  });

  return errors.length ? { exams: [], errors } : { exams, errors: [] };
}
