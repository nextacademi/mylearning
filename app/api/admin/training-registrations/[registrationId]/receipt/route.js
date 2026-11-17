import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb, getAdminStorage } from "../../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../../lib/server/cached-profile";
import { readReceipt } from "../../../../../../lib/server/training-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

// Streams a registration's payment receipt to Admin / Director. Receipts
// are private Storage objects (never made public), so this is the only way
// to view one.
export async function GET(request, context) {
  try {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ message: "Sign in to continue." }, { status: 401 });
    const db = getAdminDb();
    const decoded = await getAdminAuth().verifyIdToken(token).catch(() => null);
    if (!decoded) return NextResponse.json({ message: "Your session has expired. Please sign in again." }, { status: 401 });
    const profile = await getCachedUserSnapshot(db, decoded.uid);
    const data = profile.data() || {};
    if (!profile.exists || data.active === false || !managers.has(data.role)) {
      return NextResponse.json({ message: "Administrator or Director access is required." }, { status: 403 });
    }
    const { registrationId } = await context.params;
    if (!registrationId || registrationId.includes("/")) return NextResponse.json({ message: "Registration not found." }, { status: 404 });
    const receipt = await readReceipt(db, getAdminStorage(), registrationId);
    const safeName = receipt.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "receipt";
    return new NextResponse(receipt.bytes, {
      headers: {
        "Content-Type": receipt.contentType,
        "Content-Disposition": `inline; filename="${safeName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
    console.error("[training-registration-receipt] failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return NextResponse.json({ message: "Unable to load the receipt." }, { status: 500 });
  }
}
