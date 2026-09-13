import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { generateUserId } from "../../../../lib/server/user-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

// There was previously no way to create a Teacher account from inside the
// LMS at all (only Admin/Director accounts exist to grant roles via
// /api/admin/users' PATCH, and Teacher isn't a self-registerable role
// path this app exposes) — this route fills that real gap, mirroring
// /api/admin/students' POST pattern exactly (Admin SDK createUser + a
// Firestore profile + a sequential human-readable ID), so the AI Assistant
// (and, going forward, a normal "Add Teacher" UI) has a real, secure
// endpoint to call instead of the assistant inventing a fake success.
async function requireManager(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 401 }) };
  const auth = getAdminAuth();
  const db = getAdminDb();
  const decoded = await auth.verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  if (!profile.exists || profile.data().active === false || !managers.has(profile.data().role)) {
    return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 403 }) };
  }
  return { auth, db };
}

function failure(stage, error) {
  console.error("[teachers-api] failed", { stage, code: error?.code || "unknown" });
  return NextResponse.json({ message: `Teacher API failed at ${stage}. Check the server log for the safe error code.` }, { status: 500 });
}

export async function POST(request) {
  let createdUser;
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { displayName, email, phone, department, designation, joiningDate, status, password, qualification, experience, specialization } = await request.json();
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!displayName?.trim() || !normalizedEmail || !phone?.trim() || !department?.trim() || !designation?.trim() || !joiningDate || !status || !password) {
      return NextResponse.json({ message: "Name, email, phone, department, designation, joining date, status, and password are required." }, { status: 400 });
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return NextResponse.json({ message: "Enter a valid email address." }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ message: "Use a password with at least six characters." }, { status: 400 });
    if (!["Active", "Inactive"].includes(status)) return NextResponse.json({ message: "Status must be Active or Inactive." }, { status: 400 });

    createdUser = await access.auth.createUser({ email: normalizedEmail, password, displayName: displayName.trim(), disabled: status === "Inactive" });
    try {
      const userId = await generateUserId(access.db, new Date());
      const now = FieldValue.serverTimestamp();
      await access.db.collection("users").doc(createdUser.uid).create({
        uid: createdUser.uid,
        userId,
        email: createdUser.email || normalizedEmail,
        displayName: displayName.trim(),
        phone: phone.trim(),
        photoURL: "",
        role: "Teacher",
        active: status !== "Inactive",
        department: department.trim(),
        designation: designation.trim(),
        joiningDate,
        qualification: (qualification || "").trim(),
        experience: (experience || "").trim(),
        specialization: (specialization || "").trim(),
        teacherIds: [],
        createdAt: now,
        updatedAt: now,
      });
      return NextResponse.json({ uid: createdUser.uid, userId }, { status: 201 });
    } catch (error) {
      try {
        await access.auth.deleteUser(createdUser.uid);
      } catch (rollbackError) {
        console.error("[teachers-api] rollback failed", { code: rollbackError?.code || "unknown" });
      }
      throw error;
    }
  } catch (error) {
    const known = { "auth/email-already-exists": "An account already exists for this email.", "auth/invalid-email": "Enter a valid email address.", "auth/invalid-password": "Use a password with at least six characters." };
    return known[error?.code] ? NextResponse.json({ message: known[error.code] }, { status: 400 }) : failure(createdUser ? "teacher-profile creation" : "teacher-account creation", error);
  }
}
