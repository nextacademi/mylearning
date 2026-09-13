import { NextResponse } from "next/server";
import { getAdminDb } from "../../../../lib/firebase-admin";
import { cached } from "../../../../lib/redis-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public certificate verification — no auth required, mirrors the
// Admin-SDK-proxy pattern already used by app/api/promote/[slug] since
// certificates has no public Firestore read rule (and shouldn't get one —
// this route deliberately returns only the minimum fields a verifier
// needs, never the full record). `certificateId` here is either the
// document id or the permanent human-readable certificateCode — both are
// accepted since either could be printed/QR-encoded on the certificate.
//
// Cached for 5 minutes, keyed by the exact certificateId/certificateCode
// looked up: a certificate's content is immutable once issued (only its
// `status` can later flip to "revoked"), and this is the one route on the
// whole site that's plausibly hit repeatedly for the SAME id — a shared
// certificate link opened by many people, or a QR code scanned more than
// once. Revocation invalidates this key explicitly (see
// lib/server/certificate-core.js's revoke path) rather than relying on the
// TTL alone, since serving "valid" for an already-revoked certificate for
// up to 5 minutes is a real (if narrow) correctness concern.
export async function GET(_request, context) {
  try {
    const { certificateId } = await context.params;
    if (!certificateId) return NextResponse.json({ result: "not_found" }, { status: 404 });

    const payload = await cached(`verify-cert:${certificateId}`, 300, async () => {
      const db = getAdminDb();
      let snapshot = await db.collection("certificates").doc(certificateId).get();
      if (!snapshot.exists) {
        const bySlug = await db.collection("certificates").where("certificateCode", "==", certificateId).limit(1).get();
        if (!bySlug.empty) snapshot = bySlug.docs[0];
      }
      if (!snapshot.exists) {
        return { result: "not_found" };
      }

      const cert = snapshot.data();
      const [studentSnap, courseSnap] = await Promise.all([
        cert.studentId ? db.collection("users").doc(cert.studentId).get() : null,
        cert.courseId ? db.collection("courses").doc(cert.courseId).get() : null,
      ]);
      const student = studentSnap?.exists ? studentSnap.data() : {};
      const course = courseSnap?.exists ? courseSnap.data() : {};

      const base = {
        certificateId: cert.certificateCode || snapshot.id,
        studentName: student.displayName || cert.metadata?.studentName || "",
        courseName: course.title || cert.metadata?.courseName || "",
        issueDate: cert.issueDate?.toDate?.().toISOString().slice(0, 10) || cert.metadata?.completionDate || "",
        certificateType: cert.type || "",
      };

      return cert.status === "revoked" ? { result: "revoked", ...base } : { result: "valid", ...base };
    });
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[verify-api] failed", { message: error?.message });
    return NextResponse.json({ result: "not_found" }, { status: 500 });
  }
}
