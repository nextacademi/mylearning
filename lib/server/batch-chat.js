import { FieldValue } from "firebase-admin/firestore";

// One auto-managed group chat per training/batch (course) — every student
// enrolled in it is added automatically, no manual "Create Group" step.
// Called from createEnrollment (lib/server/enrollment-core.js) right after
// an enrollment is written. A deterministic id (`batch_<courseId>`) makes
// this idempotent: re-enrolling, or two enrollments racing, never creates a
// duplicate group — it's the same conversation doc a Teacher/Admin/Director
// could otherwise have created by hand via CreateGroupModal, just seeded
// and kept in sync automatically instead.
export async function ensureBatchGroupChat(db, { course, studentId, studentName, studentRole }) {
  const ref = db.collection("conversations").doc(`batch_${course.id}`);
  const snapshot = await ref.get();
  const now = FieldValue.serverTimestamp();
  const teacherIds = Array.isArray(course.teacherIds) ? [...new Set(course.teacherIds)] : [];

  if (!snapshot.exists) {
    // Best-effort teacher name/role lookup for participantNames/Roles — a
    // missing name shows blank in the chat UI rather than blocking creation.
    const teacherDocs = teacherIds.length
      ? await db.getAll(...teacherIds.map((id) => db.collection("users").doc(id)))
      : [];
    const participantIds = [...new Set([...teacherIds, studentId])];
    const participantNames = {};
    const participantRoles = {};
    teacherDocs.forEach((doc) => {
      if (!doc.exists) return;
      participantNames[doc.id] = doc.data().displayName || doc.data().email || "";
      participantRoles[doc.id] = doc.data().role || "Teacher";
    });
    participantNames[studentId] = studentName || "";
    participantRoles[studentId] = studentRole || "Student";

    await ref.set({
      type: "group",
      participantIds,
      participantNames,
      participantRoles,
      groupName: `${course.title || "Training"} — Batch`,
      groupPhoto: "",
      groupDescription: "Auto-created group for everyone enrolled in this training.",
      groupAdminIds: teacherIds,
      createdBy: null,
      teacherId: null,
      studentId: null,
      lastMessage: "",
      lastMessageAt: null,
      unreadCount: Object.fromEntries(participantIds.map((id) => [id, 0])),
      hiddenFor: [],
      createdAt: now,
      updatedAt: now,
    });
    return;
  }

  const data = snapshot.data();
  if ((data.participantIds || []).includes(studentId)) return;
  await ref.update({
    participantIds: FieldValue.arrayUnion(studentId),
    [`participantNames.${studentId}`]: studentName || "",
    [`participantRoles.${studentId}`]: studentRole || "Student",
    [`unreadCount.${studentId}`]: 0,
    updatedAt: now,
  });
}
