import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);
const statuses = new Set(["Draft", "Upcoming", "Active", "Completed", "Archived"]);
const levels = new Set(["", "Beginner", "Intermediate", "Advanced"]);
const enrollmentStatuses = new Set(["Open", "Closed"]);
const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const date = (value) =>
  value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null;
const chunks = (items, size = 30) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  );

function failure(error) {
  console.error("[training-api] assigned-course query failed", {
    code: error?.code || "unknown",
    message: error?.message || "unknown",
  });
  return NextResponse.json(
    { message: "Failed to load your assigned courses." },
    { status: 500 },
  );
}

async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token)
    return { denied: NextResponse.json({ message: "Sign in to access training." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false)
    return { denied: NextResponse.json({ message: "You do not have access to training." }, { status: 403 }) };
  return { db, uid: decoded.uid, role: data.role || "" };
}

async function loadRelatedRows(db, courseIds) {
  if (!courseIds.length) return { classes: [], enrollments: [] };
  const groups = await Promise.all(
    chunks(courseIds).map(async (ids) => {
      const [classes, enrollments] = await Promise.all([
        db.collection("classes").where("courseId", "in", ids).get(),
        db.collection("enrollments").where("courseId", "in", ids).get(),
      ]);
      return {
        classes: classes.docs.map(plain),
        enrollments: enrollments.docs.map(plain),
      };
    }),
  );
  return {
    classes: groups.flatMap((group) => group.classes),
    enrollments: groups.flatMap((group) => group.enrollments),
  };
}

async function nextCourseCode(db) {
  const ref = db.collection("_counters").doc("courses");
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const next = (snapshot.data()?.lastCourseNumber || 0) + 1;
    transaction.set(ref, { lastCourseNumber: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return `TRN-${String(next).padStart(3, "0")}`;
  });
}

// Existing courses were created before Course Codes existed. Backfill them
// once, in creation order, so codes stay stable and unique going forward.
// This only ever adds the missing field — it never touches teacherIds, the
// Firestore document ID, or any other existing data.
async function backfillCourseCodes(db, courses) {
  const missing = courses
    .filter((course) => !course.courseCode)
    .sort((left, right) => (left.createdAt?.toMillis?.() || 0) - (right.createdAt?.toMillis?.() || 0));
  for (const course of missing) {
    const courseCode = await nextCourseCode(db);
    await db.collection("courses").doc(course.id).update({ courseCode });
    course.courseCode = courseCode;
  }
}

async function loadTeachers(db, courses, includeDirectory) {
  if (includeDirectory) {
    const snapshots = await db.collection("users").where("role", "==", "Teacher").get();
    return snapshots.docs.map(plain);
  }
  const teacherIds = [...new Set(courses.flatMap((course) => course.teacherIds || []))];
  if (!teacherIds.length) return [];
  const snapshots = await db.getAll(
    ...teacherIds.map((teacherId) => db.collection("users").doc(teacherId)),
  );
  return snapshots
    .filter((snapshot) => snapshot.exists && snapshot.data().role === "Teacher")
    .map(plain);
}

function courseRow(course, teachers, classes, enrollments) {
  const teacherIds = Array.isArray(course.teacherIds) ? course.teacherIds : [];
  return {
    id: course.id,
    courseCode: course.courseCode || course.id,
    title: course.title || course.name || "",
    description: course.description || "",
    status: course.status || "",
    category: course.category || "",
    level: course.level || "",
    trainingType: "Offline",
    thumbnailUrl: course.thumbnailUrl || "",
    price: typeof course.price === "number" ? course.price : 0,
    discountPrice: typeof course.discountPrice === "number" ? course.discountPrice : null,
    currency: "SGD",
    teacherIds,
    teachers: teacherIds.map((teacherId) => teachers.get(teacherId)).filter(Boolean),
    primaryTeacherId: course.primaryTeacherId || "",
    assistantTeacherId: course.assistantTeacherId || "",
    primaryClassId: course.primaryClassId || "",
    startDate: date(course.startDate || course.startsAt || course.startAt) || course.startDate || "",
    endDate: date(course.endDate || course.endsAt || course.endAt) || course.endDate || "",
    startTime: course.startTime || "",
    endTime: course.endTime || "",
    classFrequency: course.classFrequency || "",
    totalClasses: course.totalClasses ?? null,
    duration: course.duration || null,
    campus: course.campus || "",
    building: course.building || "",
    room: course.room || "",
    floor: course.floor || "",
    batchName: course.batchName || "",
    maxStudents: course.maxStudents ?? null,
    seatCapacity: course.seatCapacity ?? null,
    enrollmentStartDate: course.enrollmentStartDate || "",
    enrollmentDeadline: course.enrollmentDeadline || "",
    enrollmentStatus: course.enrollmentStatus || "Open",
    passingScore: course.passingScore ?? null,
    certificateEnabled: Boolean(course.certificateEnabled),
    certificateMinAttendance: course.certificateMinAttendance ?? null,
    certificateMinScore: course.certificateMinScore ?? null,
    certificateTemplateId: course.certificateTemplateId || "",
    certificateCode: course.certificateCode || "",
    enrolled: enrollments.filter((entry) => entry.courseId === course.id && entry.status !== "withdrawn").length,
    classCount: classes.filter((entry) => entry.courseId === course.id).length,
    createdAt: date(course.createdAt),
    updatedAt: date(course.updatedAt),
  };
}

async function validateInstructors(db, body) {
  const primaryTeacherId = typeof body.primaryTeacherId === "string" ? body.primaryTeacherId : "";
  const assistantTeacherId = typeof body.assistantTeacherId === "string" ? body.assistantTeacherId : "";
  if (!primaryTeacherId) throw new Error("Choose a primary teacher.");
  if (assistantTeacherId && assistantTeacherId === primaryTeacherId) {
    throw new Error("The assistant teacher must be different from the primary teacher.");
  }
  const ids = [primaryTeacherId, ...(assistantTeacherId ? [assistantTeacherId] : [])];
  const docs = await db.getAll(...ids.map((id) => db.collection("users").doc(id)));
  if (docs.some((item) => !item.exists || item.data().role !== "Teacher")) {
    throw new Error("Choose only active users with the Teacher role.");
  }
  return { primaryTeacherId, assistantTeacherId, teacherIds: [...new Set(ids)] };
}

// Certificate settings reference the Achievement module's own template
// storage — this is the ONLY place Course reads from Achievement (a
// template id + a display code), never a second certificate system. When
// enabled, a template MUST be chosen and MUST be active — silently
// allowing "enabled, no template" would let a course later fail to issue
// certificates with no admin ever having been told why.
async function validateCertificateSettings(db, body) {
  const certificateEnabled = Boolean(body.certificateEnabled);
  const certificateTemplateId = typeof body.certificateTemplateId === "string" ? body.certificateTemplateId.trim() : "";
  const certificateCode = text(body.certificateCode, 40);
  if (certificateEnabled) {
    if (!certificateTemplateId) throw new Error("Certificate is enabled — choose a certificate template, or turn Certificate Enabled off.");
    const templateSnap = await db.collection("certificateTemplates").doc(certificateTemplateId).get();
    if (!templateSnap.exists || templateSnap.data().status !== "active") {
      throw new Error("The selected certificate template is not active. Choose an active template from Achievement.");
    }
  }
  return { certificateTemplateId, certificateCode };
}

const text = (value, max) => {
  const v = typeof value === "string" ? value.trim() : "";
  if (v.length > max) throw new Error(`Enter up to ${max} characters.`);
  return v;
};
const numberOrNull = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function courseFields(body) {
  const title = text(body.title, 160);
  const description = text(body.description, 5000);
  const status = typeof body.status === "string" ? body.status : "";
  const level = typeof body.level === "string" ? body.level : "";
  const enrollmentStatus = typeof body.enrollmentStatus === "string" && body.enrollmentStatus ? body.enrollmentStatus : "Open";
  if (!title) throw new Error("Enter a training title.");
  if (!statuses.has(status)) throw new Error("Choose a valid training status.");
  if (!levels.has(level)) throw new Error("Choose a valid level.");
  if (!enrollmentStatuses.has(enrollmentStatus)) throw new Error("Choose a valid enrollment status.");

  const price = numberOrNull(body.price) ?? 0;
  if (price < 0) throw new Error("Course price cannot be negative.");
  const discountPrice =
    body.discountPrice === "" || body.discountPrice === null || body.discountPrice === undefined
      ? null
      : numberOrNull(body.discountPrice);
  if (discountPrice !== null) {
    if (discountPrice < 0) throw new Error("Discount price cannot be negative.");
    if (discountPrice > price) throw new Error("Discount price cannot be greater than the course price.");
  }
  // Pricing is fixed to a single currency — not a client-editable field.
  const currency = "SGD";

  return {
    title,
    description,
    status,
    category: text(body.category, 100),
    level,
    thumbnailUrl: text(body.thumbnailUrl, 2000),
    thumbnailPath: text(body.thumbnailPath, 2000),
    price,
    discountPrice,
    currency,
    startDate: text(body.startDate, 20),
    endDate: text(body.endDate, 20),
    startTime: text(body.startTime, 10),
    endTime: text(body.endTime, 10),
    classFrequency: text(body.classFrequency, 100),
    totalClasses: numberOrNull(body.totalClasses),
    duration: text(body.duration, 60),
    campus: text(body.campus, 160),
    building: text(body.building, 160),
    room: text(body.room, 160),
    floor: text(body.floor, 60),
    batchName: text(body.batchName, 160),
    maxStudents: numberOrNull(body.maxStudents),
    seatCapacity: numberOrNull(body.seatCapacity),
    enrollmentStartDate: text(body.enrollmentStartDate, 20),
    enrollmentDeadline: text(body.enrollmentDeadline, 20),
    enrollmentStatus,
    passingScore: numberOrNull(body.passingScore),
    certificateEnabled: Boolean(body.certificateEnabled),
    certificateMinAttendance: numberOrNull(body.certificateMinAttendance),
    certificateMinScore: numberOrNull(body.certificateMinScore),
  };
}

export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    let snapshots;
    if (managers.has(a.role)) snapshots = await a.db.collection("courses").get();
    else if (a.role === "Teacher") snapshots = await a.db.collection("courses").where("teacherIds", "array-contains", a.uid).get();
    else return NextResponse.json({ message: "You do not have access to training." }, { status: 403 });

    const courses = snapshots.docs.map(plain);
    if (managers.has(a.role)) await backfillCourseCodes(a.db, courses);
    const courseIds = courses.map((course) => course.id);
    const [teacherRows, related] = await Promise.all([
      loadTeachers(a.db, courses, managers.has(a.role)),
      loadRelatedRows(a.db, courseIds),
    ]);
    const teacherMap = new Map(
      teacherRows.map((teacher) => [
        teacher.id,
        { id: teacher.id, uid: teacher.uid || teacher.id, displayName: teacher.displayName || teacher.name || "", email: teacher.email || "" },
      ]),
    );
    const rows = courses
      .map((course) => courseRow(course, teacherMap, related.classes, related.enrollments))
      .sort((left, right) => left.title.localeCompare(right.title));

    console.info("[training-api] assigned course query", {
      authenticatedUid: a.uid,
      role: a.role,
      queryResultCount: rows.length,
      returnedCourseIds: rows.map((course) => course.id),
      teacherIds: rows.map((course) => course.teacherIds),
      projectId: a.db.projectId,
    });
    return NextResponse.json({
      courses: rows,
      teachers: managers.has(a.role) ? [...teacherMap.values()] : [],
      canManage: managers.has(a.role),
    });
  } catch (error) {
    return failure(error);
  }
}

// Every training is created with exactly one physical batch/class alongside
// it — there is no in-app way to create a bare `classes` doc otherwise, and
// without one, students can never be enrolled (see app/api/admin/students
// /route.js's "no active class available" check).
function classFieldsFromCourse(fields, teacherIds) {
  return {
    name: fields.batchName || fields.title,
    campus: fields.campus,
    building: fields.building,
    room: fields.room,
    floor: fields.floor,
    startDate: fields.startDate,
    endDate: fields.endDate,
    startTime: fields.startTime,
    endTime: fields.endTime,
    maxStudents: fields.maxStudents,
    teacherIds,
  };
}

export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    if (!managers.has(a.role)) return NextResponse.json({ message: "Administrator access is required." }, { status: 403 });
    const body = await request.json();
    const fields = courseFields(body);
    const instructors = await validateInstructors(a.db, body);
    const certificateSettings = await validateCertificateSettings(a.db, body);
    const courseCode = await nextCourseCode(a.db);
    const courseRef = a.db.collection("courses").doc();
    const classRef = a.db.collection("classes").doc();
    const now = FieldValue.serverTimestamp();
    const batch = a.db.batch();
    batch.set(courseRef, {
      ...fields,
      ...instructors,
      ...certificateSettings,
      courseCode,
      primaryClassId: classRef.id,
      createdAt: now,
      updatedAt: now,
    });
    batch.set(classRef, {
      ...classFieldsFromCourse(fields, instructors.teacherIds),
      courseId: courseRef.id,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await batch.commit();
    return NextResponse.json(
      { course: { id: courseRef.id, courseCode, primaryClassId: classRef.id, ...fields, ...instructors, ...certificateSettings } },
      { status: 201 },
    );
  } catch (error) {
    return error?.message ? NextResponse.json({ message: error.message }, { status: 400 }) : failure(error);
  }
}

export async function PATCH(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    if (!managers.has(a.role)) return NextResponse.json({ message: "Administrator access is required." }, { status: 403 });
    const body = await request.json();
    if (typeof body.id !== "string" || !body.id) return NextResponse.json({ message: "Course ID is required." }, { status: 400 });
    const ref = a.db.collection("courses").doc(body.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return NextResponse.json({ message: "Training not found." }, { status: 404 });
    const fields = courseFields(body);
    const instructors = await validateInstructors(a.db, body);
    const certificateSettings = await validateCertificateSettings(a.db, body);
    const batch = a.db.batch();
    batch.update(ref, { ...fields, ...instructors, ...certificateSettings, updatedAt: FieldValue.serverTimestamp() });
    const primaryClassId = snapshot.data().primaryClassId;
    if (primaryClassId) {
      batch.update(a.db.collection("classes").doc(primaryClassId), {
        ...classFieldsFromCourse(fields, instructors.teacherIds),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return error?.message ? NextResponse.json({ message: error.message }, { status: 400 }) : failure(error);
  }
}