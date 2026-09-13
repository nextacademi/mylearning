import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot, invalidateUserProfileCache } from "../../../../lib/server/cached-profile";
import { cached, cacheDel } from "../../../../lib/redis-cache";
import { attendancePercent } from "../../../../lib/attendance";
import { generateUserId, ensureUserId } from "../../../../lib/server/user-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);
const inactiveClasses = new Set(["archived", "cancelled"]);
const plain = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const percent = (value, total) => (total ? Math.round((value / total) * 100) : null);
const isoDate = (value) => (value?.toDate ? value.toDate().toISOString() : typeof value === "string" ? value : null);

function failure(stage, error) {
  console.error("[students-api] request failed", { stage, code: error?.code || "unknown" });
  const credentials = error?.message?.includes("Firebase Admin credentials are not configured");
  return NextResponse.json({ message: credentials ? "Student API failed at Firebase Admin initialization. Configure the server Firebase Admin credentials." : `Student API failed at ${stage}. Check the server log for the safe error code.` }, { status: 500 });
}
async function requireManager(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 401 }) };
  const auth = getAdminAuth(); const db = getAdminDb();
  const decoded = await auth.verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  if (!profile.exists || profile.data().active === false || !managers.has(profile.data().role)) return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 403 }) };
  return { auth, db, adminUid: decoded.uid };
}

// Both branches below are identical for every Admin/Director who loads this
// page — a 6-collection fan-out read (or a 3-collection one for `?resource=
// courses`) re-run on every tab load/refresh with no per-user variation.
// Cached for 30s: short enough that a grade/attendance/enrollment change
// elsewhere shows up within one page-refresh cycle, long enough to collapse
// the "whole admin team has this tab open" case into one real Firestore
// read instead of one per viewer. The unified-User-ID backfill is excluded
// from the cached payload (kept live) since it's a rare, idempotent,
// self-healing write path, not something worth caching around.
export async function GET(request) {
  try {
    const access = await requireManager(request); if (access.denied) return access.denied;
    const { db } = access;
    if (new URL(request.url).searchParams.get("resource") === "courses") {
      const payload = await cached("admin-students:courses", 30, async () => {
        const [courses, classes, teachers] = await Promise.all([db.collection("courses").get(), db.collection("classes").get(), db.collection("users").where("role", "==", "Teacher").get()]);
        const available = new Set(classes.docs.map(plain).filter((item) => !inactiveClasses.has(item.status)).map((item) => item.courseId));
        const byId = new Map(teachers.docs.map((item) => [item.id, plain(item)]));
        return { courses: courses.docs.map(plain).map((item) => ({ id: item.id, title: item.title || item.name || "Untitled course", enrollmentAvailable: available.has(item.id), teachers: (item.teacherIds || []).map((id) => byId.get(id)).filter(Boolean).map((teacher) => ({ id: teacher.id, name: teacher.displayName || teacher.email || "Teacher" })) })).sort((a, b) => a.title.localeCompare(b.title)) };
      });
      return NextResponse.json(payload);
    }
    const rows = await cached("admin-students:list", 30, async () => {
      const [students, enrollmentDocs, courseDocs, assignments, submissions, attendance] = await Promise.all([db.collection("users").where("role", "==", "Student").get(), db.collection("enrollments").get(), db.collection("courses").get(), db.collection("assignments").get(), db.collection("submissions").get(), db.collection("attendance").get()]);
      const enrollments = enrollmentDocs.docs.map(plain), courseMap = new Map(courseDocs.docs.map((item) => [item.id, plain(item)])), assignmentRows = assignments.docs.map(plain), submissionRows = submissions.docs.map(plain), attendanceRows = attendance.docs.map(plain);
      return students.docs.map(plain).map((student) => {
        const own = enrollments.filter((item) => item.studentId === student.id), courseIds = new Set(own.map((item) => item.courseId).filter(Boolean));
        const totalAssignments = assignmentRows.filter((item) => courseIds.has(item.courseId));
        const completed = new Set(submissionRows.filter((item) => item.studentId === student.id && courseIds.has(item.courseId)).map((item) => item.assignmentId).filter(Boolean));
        const ownAttendance = attendanceRows.filter((item) => item.studentId === student.id);
        return { ...student, userId: student.userId || null, courseNames: [...courseIds].map((id) => courseMap.get(id)?.title || "Course unavailable").join(", ") || null, progress: percent(completed.size, totalAssignments.length), attendance: attendancePercent(ownAttendance), createdAt: isoDate(student.createdAt) };
      });
    });
    // Belt-and-suspenders backfill for any Student doc still missing the
    // unified User ID (legacy accounts pre-dating this field) — same
    // pattern as lib/server/enrollment-core.js. Runs against the cached
    // rows in-memory only; doesn't invalidate the cache since it patches
    // the same value already served.
    await Promise.all(rows.filter((row) => !row.userId).map((row) => ensureUserId(db, row.id).then((userId) => { row.userId = userId; })));
    return NextResponse.json({ students: rows });
  } catch (error) { return failure("student-list request", error); }
}
export async function POST(request) {
  let createdUser;
  try {
    const access = await requireManager(request); if (access.denied) return access.denied;
    const { displayName, email, phone, courseId, password } = await request.json(); const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!displayName?.trim() || !normalizedEmail || !phone?.trim() || !courseId || !password) return NextResponse.json({ message: "Name, email, phone number, course, and password are required." }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ message: "Use a password with at least six characters." }, { status: 400 });
    const course = await access.db.collection("courses").doc(courseId).get(); if (!course.exists) return NextResponse.json({ message: "Choose an existing course." }, { status: 400 });
    const selectedClass = (await access.db.collection("classes").where("courseId", "==", courseId).get()).docs.map(plain).filter((item) => !inactiveClasses.has(item.status)).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!selectedClass) return NextResponse.json({ message: "This course has no active class available for enrollment." }, { status: 400 });
    createdUser = await access.auth.createUser({ email: normalizedEmail, password, displayName: displayName.trim(), disabled: false });
    try {
      const userId = await generateUserId(access.db, new Date()), now = FieldValue.serverTimestamp(), teacherIds = [...new Set([...(course.data().teacherIds || []), ...(selectedClass.teacherIds || [])])], batch = access.db.batch();
      batch.create(access.db.collection("users").doc(createdUser.uid), { uid: createdUser.uid, userId, email: createdUser.email || normalizedEmail, displayName: displayName.trim(), phone: phone.trim(), photoURL: "", role: "Student", active: true, status: "active", teacherIds, createdAt: now, updatedAt: now });
      batch.create(access.db.collection("enrollments").doc(`${courseId}_${createdUser.uid}`), { courseId, classId: selectedClass.id, studentId: createdUser.uid, status: "active", enrolledAt: now, completedAt: null });
      await batch.commit(); await cacheDel("admin-students:list"); return NextResponse.json({ uid: createdUser.uid, userId }, { status: 201 });
    } catch (error) { try { await access.auth.deleteUser(createdUser.uid); } catch (rollbackError) { console.error("[students-api] rollback failed", { code: rollbackError?.code || "unknown" }); } throw error; }
  } catch (error) {
    const known = { "auth/email-already-exists": "An account already exists for this email.", "auth/invalid-email": "Enter a valid email address.", "auth/invalid-password": "Use a password with at least six characters." };
    return known[error?.code] ? NextResponse.json({ message: known[error.code] }, { status: 400 }) : failure(createdUser ? "student-profile or enrollment creation" : "student-account creation", error);
  }
}
export async function PATCH(request) {
  try {
    const access = await requireManager(request); if (access.denied) return access.denied;
    const { uid, displayName, phone, active, status, rejectionReason } = await request.json(); if (!uid) return NextResponse.json({ message: "Student ID is required." }, { status: 400 });
    const ref = access.db.collection("users").doc(uid), profile = await ref.get(); if (!profile.exists || profile.data().role !== "Student") return NextResponse.json({ message: "Student not found." }, { status: 404 });
    if (typeof displayName === "string" && !displayName.trim()) return NextResponse.json({ message: "Full name is required." }, { status: 400 }); if (typeof phone === "string" && !phone.trim()) return NextResponse.json({ message: "Phone number is required." }, { status: 400 });
    const wasPending = profile.data().status === "pending";
    const approving = status === "active";
    const rejecting = status === "rejected";
    if ((approving || rejecting) && !wasPending) return NextResponse.json({ message: "Only a pending registration can be approved or rejected." }, { status: 400 });
    await ref.update({
      ...(typeof displayName === "string" ? { displayName: displayName.trim() } : {}),
      ...(typeof phone === "string" ? { phone: phone.trim() } : {}),
      ...(typeof active === "boolean" ? { active } : {}),
      ...(approving ? { status: "active", approvedAt: FieldValue.serverTimestamp(), approvedBy: access.adminUid } : {}),
      ...(rejecting
        ? {
            status: "rejected",
            rejectedAt: FieldValue.serverTimestamp(),
            rejectedBy: access.adminUid,
            rejectionReason: typeof rejectionReason === "string" ? rejectionReason.trim().slice(0, 500) : "",
          }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (typeof displayName === "string" || typeof active === "boolean") await access.auth.updateUser(uid, { ...(typeof displayName === "string" ? { displayName: displayName.trim() } : {}), ...(typeof active === "boolean" ? { disabled: !active } : {}) });
    await cacheDel("admin-students:list");
    if (typeof active === "boolean" || approving || rejecting) await invalidateUserProfileCache(uid);
    if (approving) {
      // Approval is the moment a member becomes eligible for the D Card —
      // ensure their unified User ID exists right now (idempotent: never
      // touches it if one already exists), instead of only relying on the
      // next-login self-heal in lib/auth-context.js.
      await ensureUserId(access.db, uid);
      await access.db.collection("notifications").add({
        userId: uid,
        type: "account.approved",
        title: "🎉 Account Approved",
        body: "Your account has been approved. Welcome to Next Academy!",
        entityId: uid,
        actionUrl: null,
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    if (rejecting) {
      await access.db.collection("notifications").add({
        userId: uid,
        type: "account.rejected",
        title: "Registration Not Approved",
        body: (typeof rejectionReason === "string" && rejectionReason.trim()) || "Your registration was not approved. Contact the academy for more information.",
        entityId: uid,
        actionUrl: null,
        readAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (error) { return failure("student-profile update", error); }
}