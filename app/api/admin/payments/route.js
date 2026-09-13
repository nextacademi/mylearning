import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";
import { listPaymentsForEnrollment, recordPayment } from "../../../../lib/server/payment-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function failure(stage, error) {
  console.error("[payments-api] failed", { stage, code: error?.code || "unknown", message: error?.message || "unknown" });
  return NextResponse.json({ message: "Unable to manage payments. Please try again." }, { status: 500 });
}

async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false || !managers.has(data.role)) {
    return { denied: NextResponse.json({ message: "Administrator access is required." }, { status: 403 }) };
  }
  return { db, uid: decoded.uid };
}

export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const enrollmentId = new URL(request.url).searchParams.get("enrollmentId");
    if (!enrollmentId) return NextResponse.json({ message: "Enrollment ID is required." }, { status: 400 });

    const payments = await listPaymentsForEnrollment(a.db, enrollmentId);
    return NextResponse.json({ payments });
  } catch (error) {
    return failure("list", error);
  }
}

export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json();
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const studentId = typeof body.studentId === "string" ? body.studentId : "";
    if (!courseId || !studentId) return NextResponse.json({ message: "Training and student are required." }, { status: 400 });

    const result = await recordPayment(a.db, {
      courseId,
      studentId,
      amount: body.amount,
      paymentMethod: body.paymentMethod,
      paymentDate: body.paymentDate,
      reference: body.reference,
      notes: body.notes,
      createdBy: a.uid,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return failure("collect", error);
  }
}
