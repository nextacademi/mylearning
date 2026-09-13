import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { ensureUserId } from "../../../../lib/server/user-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const date = (value) => (value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null);

function failed(stage, error) {
  console.error("[teacher-assignment-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to manage teacher assignments. Check the server log for the safe error code." }, { status: 500 });
}

// Teacher Assignment is an Admin/Director-only capability. This runs on
// every request (never trusts the client), and firestore.rules
// additionally blocks any non-admin from writing `teacherIds` on a course
// or class — so a Student/Teacher cannot assign, change, or remove a
// teacher even with a hand-crafted request.
async function requireManager(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 401 }) };
  const auth = getAdminAuth();
  const db = getAdminDb();
  const decoded = await auth.verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || !["Admin", "Director"].includes(data.role)) {
    return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid };
}

function teacherProfile(doc) {
  return {
    id: doc.id,
    uid: doc.uid || doc.id,
    displayName: doc.displayName || "",
    email: doc.email || "",
    phone: doc.phone || "",
    photoURL: doc.photoURL || "",
    userId: doc.userId || null,
    department: doc.department || "",
    designation: doc.designation || "",
    active: doc.active !== false,
    status: doc.status || (doc.active === false ? "inactive" : "active"),
  };
}

function classSchedule(cls, course) {
  const freq = cls.classFrequency || course?.classFrequency || "";
  const window = [cls.startTime, cls.endTime].filter(Boolean).join(" – ");
  return [freq, window].filter(Boolean).join("  ·  ");
}

export async function GET(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { db } = access;

    const [teacherDocs, courseDocs, classDocs, enrollmentDocs] = await Promise.all([
      db.collection("users").where("role", "==", "Teacher").get(),
      db.collection("courses").get(),
      db.collection("classes").get(),
      db.collection("enrollments").get(),
    ]);

    const teachers = teacherDocs.docs.map(plain).map(teacherProfile).filter((teacher) => teacher.active);
    // Backfill any teacher still missing the unified User ID.
    await Promise.all(
      teachers.filter((teacher) => !teacher.userId).map((teacher) =>
        ensureUserId(db, teacher.id).then((userId) => { teacher.userId = userId; }).catch(() => {}),
      ),
    );

    const courses = courseDocs.docs.map(plain);
    const classes = classDocs.docs.map(plain);
    const enrollments = enrollmentDocs.docs.map(plain).filter((entry) => entry.status !== "withdrawn");
    const courseById = new Map(courses.map((course) => [course.id, course]));

    const courseRows = courses
      .map((course) => ({
        id: course.id,
        title: course.title || course.name || "Untitled course",
        courseCode: course.courseCode || course.id,
        duration: course.duration || "",
        status: course.status || "",
        level: course.level || "",
        teacherIds: Array.isArray(course.teacherIds) ? course.teacherIds : [],
        primaryTeacherId: course.primaryTeacherId || "",
        classCount: classes.filter((cls) => cls.courseId === course.id).length,
        enrolledCount: enrollments.filter((entry) => entry.courseId === course.id).length,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));

    const classRows = classes
      .map((cls) => ({
        id: cls.id,
        name: cls.name || cls.title || "Untitled batch",
        courseId: cls.courseId || "",
        courseName: courseById.get(cls.courseId)?.title || courseById.get(cls.courseId)?.name || "",
        courseCode: courseById.get(cls.courseId)?.courseCode || "",
        schedule: classSchedule(cls, courseById.get(cls.courseId)),
        room: [cls.room, cls.building, cls.campus].filter(Boolean).join(", "),
        teacherIds: Array.isArray(cls.teacherIds) ? cls.teacherIds : [],
        studentCount: enrollments.filter((entry) => entry.classId === cls.id).length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Real workload per teacher, derived only from the data already loaded
    // here — assigned courses/classes and the enrollments that belong to
    // them. Nothing invented, nothing separately estimated.
    const workload = new Map(teachers.map((teacher) => {
      const courseIds = courseRows.filter((course) => course.teacherIds.includes(teacher.id)).map((course) => course.id);
      const classIds = classRows.filter((cls) => cls.teacherIds.includes(teacher.id)).map((cls) => cls.id);
      const students = new Set(
        enrollments
          .filter((entry) => courseIds.includes(entry.courseId) || classIds.includes(entry.classId))
          .map((entry) => entry.studentId),
      );
      return [teacher.id, { courseCount: courseIds.length, classCount: classIds.length, studentCount: students.size, courseIds, classIds }];
    }));

    return NextResponse.json({
      teachers: teachers
        .map((teacher) => ({ ...teacher, ...workload.get(teacher.id) }))
        .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email)),
      courses: courseRows,
      classes: classRows,
      canManage: true,
    });
  } catch (error) {
    return failed("directory load", error);
  }
}

async function loadTarget(db, type, id) {
  const collection = type === "course" ? "courses" : "classes";
  const ref = db.collection(collection).doc(id);
  const snapshot = await ref.get();
  return { ref, snapshot, label: type === "course" ? "Course" : "Class" };
}

async function assertTeacher(db, teacherId) {
  const snap = await db.collection("users").doc(teacherId).get();
  if (!snap.exists) throw Object.assign(new Error("That teacher account no longer exists."), { statusCode: 404 });
  const data = snap.data();
  if (data.role !== "Teacher") throw Object.assign(new Error("Only accounts with the Teacher role can be assigned."), { statusCode: 400 });
  if (data.active === false) throw Object.assign(new Error("That teacher account is inactive."), { statusCode: 400 });
}

export async function PATCH(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { db, uid } = access;
    const body = await request.json();
    const { type, id, action } = body;

    if (!["course", "class"].includes(type) || typeof id !== "string" || !id) {
      return NextResponse.json({ message: "Invalid assignment request." }, { status: 400 });
    }

    const { ref, snapshot, label } = await loadTarget(db, type, id);
    if (!snapshot.exists) return NextResponse.json({ message: `${label} not found.` }, { status: 404 });
    const current = Array.isArray(snapshot.data().teacherIds) ? snapshot.data().teacherIds : [];

    // --- single-teacher assign / remove (the new UI) ---
    if (action === "assign" || action === "remove") {
      const teacherId = typeof body.teacherId === "string" ? body.teacherId : "";
      if (!teacherId) return NextResponse.json({ message: "Choose a teacher." }, { status: 400 });

      if (action === "assign") {
        await assertTeacher(db, teacherId);
        if (current.includes(teacherId)) {
          return NextResponse.json({ message: "This teacher is already assigned here." }, { status: 409 });
        }
        await ref.update({
          teacherIds: [...current, teacherId],
          teacherIdsUpdatedBy: uid,
          teacherIdsUpdatedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return NextResponse.json({ ok: true, teacherIds: [...current, teacherId] });
      }

      if (!current.includes(teacherId)) {
        return NextResponse.json({ message: "That teacher is not assigned here." }, { status: 409 });
      }
      const next = current.filter((value) => value !== teacherId);
      const update = {
        teacherIds: next,
        teacherIdsUpdatedBy: uid,
        teacherIdsUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      // Keep primaryTeacherId consistent when the primary teacher is removed.
      if (type === "course" && snapshot.data().primaryTeacherId === teacherId) {
        update.primaryTeacherId = next[0] || "";
      }
      await ref.update(update);
      return NextResponse.json({ ok: true, teacherIds: next });
    }

    // --- legacy: replace the whole teacherIds array (kept for the AI
    // assistant and any existing caller) ---
    const { teacherIds } = body;
    if (!Array.isArray(teacherIds) || teacherIds.some((value) => typeof value !== "string")) {
      return NextResponse.json({ message: "Invalid assignment request." }, { status: 400 });
    }
    const unique = [...new Set(teacherIds)];
    if (unique.length) {
      const docs = await db.getAll(...unique.map((teacherId) => db.collection("users").doc(teacherId)));
      if (docs.some((teacher) => !teacher.exists || teacher.data().role !== "Teacher" || teacher.data().active === false)) {
        return NextResponse.json({ message: "Choose only active teacher accounts." }, { status: 400 });
      }
    }
    await ref.update({
      teacherIds: unique,
      teacherIdsUpdatedBy: uid,
      teacherIdsUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ ok: true, teacherIds: unique });
  } catch (error) {
    if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
    return failed("assignment save", error);
  }
}
