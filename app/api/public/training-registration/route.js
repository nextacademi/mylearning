import { NextResponse } from "next/server";
import { getAdminDb, getAdminStorage } from "../../../../lib/firebase-admin";
import { submitRegistration } from "../../../../lib/server/training-registration";
import { RECEIPT_MAX_BYTES } from "../../../../lib/training-offer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Homepage "Submit a Training Registration" form — no sign-in, like the
// Contact form and appointment widget. multipart/form-data with:
//   data    — JSON: { courseId, trainee{name,title,email,whatsapp},
//             sameAsTrainee, requester{…}, company, education, startedAt,
//             website (honeypot) }
//   receipt — the payment receipt (PDF / image, max 10 MB)
// Validation, spam limits and storage all live in
// lib/server/training-registration.js.
const MAX_BODY = RECEIPT_MAX_BYTES + 512 * 1024;
const invalid = () => NextResponse.json({ message: "The form data is invalid. Please try again." }, { status: 400 });

export async function POST(request) {
  try {
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_BODY) {
      return NextResponse.json({ message: "The payment receipt must be 10 MB or smaller." }, { status: 413 });
    }
    if (!(request.headers.get("content-type") || "").includes("multipart/form-data")) {
      return NextResponse.json({ message: "Send the form as multipart/form-data." }, { status: 415 });
    }
    const form = await request.formData();
    let fields;
    try {
      fields = JSON.parse(String(form.get("data") || ""));
    } catch {
      return invalid();
    }
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) return invalid();
    const file = form.get("receipt");
    const result = await submitRegistration(getAdminDb(), getAdminStorage(), {
      fields,
      file: file instanceof File ? file : null,
      ip: (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "",
      userAgent: request.headers.get("user-agent") || "",
    });
    return NextResponse.json({ ok: true, ref: result.ref }, { status: 201 });
  } catch (error) {
    if (error?.statusCode) return NextResponse.json({ message: error.message }, { status: error.statusCode });
    console.error("[training-registration-api] submit failed", { code: error?.code || "unknown", message: error?.message || "unknown" });
    return NextResponse.json({ message: "We could not submit your registration right now. Please try again, or contact us on WhatsApp." }, { status: 500 });
  }
}
