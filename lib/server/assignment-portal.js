import { FieldValue } from "firebase-admin/firestore";
import { singaporeDate } from "./singapore-date";

// Assignment Portal (Admin/Director) — every training batch with each
// enrolled student's status on that batch's published assignments. Built
// only from the existing records: `assignments` and `submissions` (see
// lib/assignment-data.js), `enrollments`, `courses` and `users`. Nothing
// here is a second assignment system; a submission recorded from the
// portal is the same submissions/{assignmentId}_{studentId} document a
// student's own submit writes.

const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const iso = (value) => (value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null);
const safeId = (value) => typeof value === "string" && value && !value.includes("/");
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

// An assignment is owed by a student when it is for their class (or no
// class is set) and, if it lists students, they are on that list.
const owes = (assignment, enrollment) =>
  (!assignment.classId || !enrollment.classId || assignment.classId === enrollment.classId) &&
  (!assignment.studentIds?.length || assignment.studentIds.includes(enrollment.studentId));

async function usersById(db, ids) {
  const map = new Map();
  for (let i = 0; i < ids.length; i += 300) {
    const docs = await db.getAll(...ids.slice(i, i + 300).map((id) => db.collection("users").doc(id)));
    docs.filter((doc) => doc.exists).forEach((doc) => map.set(doc.id, doc.data()));
  }
  return map;
}

export async function portalSummary(db) {
  const [coursesSnap, enrollmentsSnap, assignmentsSnap, submissionsSnap] = await Promise.all([
    db.collection("courses").get(),
    db.collection("enrollments").get(),
    db.collection("assignments").where("status", "==", "published").get(),
    db.collection("submissions").get(),
  ]);
  const enrollments = enrollmentsSnap.docs.map(plain).filter((item) => item.status !== "withdrawn" && item.courseId && item.studentId);
  const assignments = assignmentsSnap.docs.map(plain);
  const submissions = new Map(submissionsSnap.docs.map((doc) => {
    const data = doc.data();
    return [`${data.assignmentId}_${data.studentId}`, data];
  }));
  const courses = coursesSnap.docs.map(plain).filter((course) => course.status !== "Archived");
  const users = await usersById(db, [...new Set([
    ...enrollments.map((item) => item.studentId),
    ...courses.map((course) => course.primaryTeacherId).filter(Boolean),
  ])]);
  const nameOf = (uid) => users.get(uid)?.displayName || users.get(uid)?.email || "";

  const batches = courses
    .map((course) => {
      const own = assignments
        .filter((item) => item.courseId === course.id)
        .sort((a, b) =>
          (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
          (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0) ||
          String(a.title || "").localeCompare(String(b.title || ""), undefined, { numeric: true }));
      const students = enrollments
        .filter((item) => item.courseId === course.id)
        .map((enrollment) => {
          const user = users.get(enrollment.studentId) || {};
          const expected = own.filter((item) => owes(item, enrollment)).map((item) => item.id);
          const done = {};
          for (const assignmentId of expected) {
            const submission = submissions.get(`${assignmentId}_${enrollment.studentId}`);
            if (submission) {
              done[assignmentId] = {
                link: submission.link || "",
                score: submission.score ?? null,
                late: Boolean(submission.late),
                submittedAt: iso(submission.submittedAt),
              };
            }
          }
          return {
            studentId: enrollment.studentId,
            userId: user.userId || "",
            name: user.displayName || user.email || "Unnamed student",
            email: user.email || "",
            phone: user.phone || "",
            expected,
            done,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        id: course.id,
        courseCode: course.courseCode || course.id,
        title: course.title || "Untitled training",
        category: course.category || "",
        status: course.status || "",
        teacherName: nameOf(course.primaryTeacherId),
        assignments: own.map((item) => ({ id: item.id, title: item.title || "Assignment", dueDate: item.dueDate || "", maxScore: item.maxScore ?? null })),
        students,
      };
    })
    .filter((batch) => batch.students.length || batch.assignments.length)
    .sort((a, b) => b.courseCode.localeCompare(a.courseCode, undefined, { numeric: true }));

  return { batches, generatedAt: new Date().toISOString() };
}

const STANDARD_ASSIGNMENTS = [
  "Assignment 1 (Fundamentals)",
  "Assignment 2 (Intermediate)",
  "Assignment 3 (Advanced Project)",
  "Assignment 4 (Capstone Submission)",
];

// One click for a training with no assignments yet: the four standard
// ones, published to its class (same fields lib/assignment-data.js's
// createAssignment writes), so students can submit them right away.
export async function createStandardAssignments(db, staffUid, courseId) {
  if (!safeId(courseId)) throw fail("Choose a training.");
  const courseSnap = await db.collection("courses").doc(courseId).get();
  if (!courseSnap.exists) throw fail("Training not found.", 404);
  const course = courseSnap.data();
  if (!course.primaryClassId) throw fail("This training has no class yet — open it once in Training, then try again.");
  const existing = await db.collection("assignments").where("courseId", "==", courseId).limit(1).get();
  if (!existing.empty) throw fail("This training already has assignments. Manage them in Model Test → Assignment.");

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  STANDARD_ASSIGNMENTS.forEach((title) => {
    batch.set(db.collection("assignments").doc(), {
      courseId,
      classId: course.primaryClassId,
      teacherId: course.primaryTeacherId || staffUid,
      title,
      instructions: "",
      dueDate: "",
      expiresAt: "",
      maxScore: 100,
      passingScore: null,
      maxAttempts: 1,
      resourceUrl: "",
      studentIds: [],
      status: "published",
      createdBy: staffUid,
      createdAt: now,
      updatedAt: now,
    });
  });
  await batch.commit();
}

// Staff record a submission for a student — e.g. work handed in on paper
// or sent on WhatsApp. Same document as the student's own submit; an
// existing answer, score and feedback are kept, and it doesn't use up one
// of the student's tries.
export async function recordSubmission(db, staffUid, body) {
  const { assignmentId, studentId } = body || {};
  if (!safeId(assignmentId) || !safeId(studentId)) throw fail("Choose an assignment and a student.");
  const link = typeof body.link === "string" ? body.link.trim().slice(0, 1000) : "";
  if (link && !/^https?:\/\//i.test(link)) throw fail("The file link must start with http:// or https://.");

  const assignmentSnap = await db.collection("assignments").doc(assignmentId).get();
  if (!assignmentSnap.exists) throw fail("Assignment not found.", 404);
  const assignment = assignmentSnap.data();
  const enrollmentSnap = await db.collection("enrollments").doc(`${assignment.courseId}_${studentId}`).get();
  const enrollment = enrollmentSnap.data();
  if (!enrollmentSnap.exists || enrollment.status === "withdrawn") throw fail("This student isn't enrolled in that training.");
  if (!owes(assignment, { ...enrollment, studentId })) throw fail("This assignment isn't set for this student.");

  const ref = db.collection("submissions").doc(`${assignmentId}_${studentId}`);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    const before = existing.exists ? existing.data() : null;
    const now = FieldValue.serverTimestamp();
    tx.set(ref, {
      assignmentId,
      courseId: assignment.courseId,
      classId: assignment.classId || enrollment.classId || "",
      teacherId: assignment.teacherId || "",
      studentId,
      answer: before?.answer || "",
      link: link || before?.link || "",
      submittedAt: now,
      attempts: before?.attempts || 1,
      late: before ? Boolean(before.late) : Boolean(assignment.dueDate && singaporeDate() > assignment.dueDate),
      score: before?.score ?? null,
      feedback: before?.feedback || "",
      gradedAt: before?.gradedAt || null,
      recordedBy: staffUid,
      recordedAt: now,
    });
  });
}
