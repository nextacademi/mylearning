import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";
import { getDocumentFileForUser } from "../../../../../lib/server/documents-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Authorised document stream. This is the ONLY path a Student ever uses to
// reach a file — the raw Storage URL is never sent to a student. Every
// request re-verifies the Firebase ID token, the account, and (via
// getDocumentFileForUser -> canAccessDocument) the student's real
// enrollment for the document's course. Changing the [id] in the URL to
// another course's document just returns 403.
async function authenticate(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const snapshot = await getCachedUserSnapshot(db, decoded.uid);
  const profile = snapshot.data() || {};
  if (!snapshot.exists || profile.active === false) {
    return { denied: NextResponse.json({ message: "Account access is required." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid, profile };
}

export async function GET(request, context) {
  try {
    const auth = await authenticate(request);
    if (auth.denied) return auth.denied;
    const { id } = await context.params;

    const { buffer, mimeType, fileName } = await getDocumentFileForUser(auth.db, id, auth.uid, auth.profile);
    const safeName = String(fileName || "document").replace(/["\\\r\n]/g, "_");

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        // Always inline — this endpoint is "view", never "download".
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
    console.error("[documents-file] failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return NextResponse.json({ message: "Unable to open this document. Please try again." }, { status: 500 });
  }
}
