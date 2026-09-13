import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A minimal-field, any-active-user-readable directory for the "New Chat:
// pick any registered user" picker. Firestore's own `users` rule only lets
// a non-admin read their own doc (or a Student they teach), so a client-side
// list query can't power this — this route exists purely to expose the
// handful of public-facing fields a chat picker needs (never phone, role
// relationships, status, etc.), excluding the caller and any
// pending/rejected account.
async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || data.status === "pending" || data.status === "rejected") {
    return { denied: NextResponse.json({ message: "Account access is required." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid };
}

export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const snapshot = await a.db.collection("users").get();
    const users = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((user) => user.id !== a.uid && user.active !== false && user.status !== "pending" && user.status !== "rejected")
      .map((user) => ({
        uid: user.id,
        displayName: user.displayName || user.email || "Member",
        email: user.email || "",
        role: user.role || "",
        photoURL: user.photoURL || "",
      }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
    return NextResponse.json({ users });
  } catch (error) {
    console.error("[chat-directory-api] failed", { message: error?.message || "unknown" });
    return NextResponse.json({ message: "Unable to load the user directory. Please try again." }, { status: 500 });
  }
}
