import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Self-service account deletion — any signed-in user deleting their OWN
// account (never someone else's; that's app/api/admin/users DELETE, which
// this deliberately does not reuse since that route requires Admin/Director
// and takes a target uid from the request body, both wrong for a self-serve
// action). Goes through the Admin SDK because Firestore's users/{userId}
// rule only lets admin() delete a profile doc — a client-side self-delete
// would remove the Auth account but leave an orphaned Firestore doc behind.
// Same last-Director guard as the admin route, and the same choice not to
// cascade-delete historical records (enrollments, submissions, attendance,
// certificates stay as real academic/audit history).
export async function POST(request) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sign in to continue." }, { status: 401 });
    const auth = getAdminAuth();
    const db = getAdminDb();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const ref = db.collection("users").doc(uid);
    const snapshot = await ref.get();
    if (snapshot.exists && snapshot.data().role === "Director") {
      const directors = await db.collection("users").where("role", "==", "Director").get();
      if (directors.size <= 1) {
        return NextResponse.json(
          { message: "You are the only Director account and cannot delete it. Assign another Director first." },
          { status: 400 },
        );
      }
    }

    try {
      await auth.deleteUser(uid);
    } catch (authError) {
      if (authError?.code !== "auth/user-not-found") throw authError;
    }
    await ref.delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[delete-account-api] failed", { code: error?.code || "unknown" });
    return NextResponse.json({ message: "Unable to delete your account. Please try again." }, { status: 500 });
  }
}
