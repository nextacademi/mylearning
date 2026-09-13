import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

async function access(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 401 }) };
  const db = getAdminDb();
  const decoded = await getAdminAuth().verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const data = profile.data() || {};
  if (!profile.exists || data.active === false) return { denied: NextResponse.json({ message: "Sign in to continue." }, { status: 403 }) };
  return { db, uid: decoded.uid, role: data.role };
}

// Certificate PDF is rendered on demand from the certificate's own stored
// fields — never regenerated from live student/course data, so a later
// name change etc. can never retroactively alter an already-issued
// certificate's content. Same data the Preview screen shows (both read the
// same certificate doc + template config), per Phase 14/15.
export async function GET(request, context) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const { certificateId } = await context.params;
    const snapshot = await a.db.collection("certificates").doc(certificateId).get();
    if (!snapshot.exists) return NextResponse.json({ message: "Certificate not found." }, { status: 404 });
    const cert = snapshot.data();

    const isOwner = cert.studentId === a.uid;
    const isTeacher = cert.teacherId === a.uid;
    if (!isOwner && !isTeacher && !managers.has(a.role)) {
      return NextResponse.json({ message: "You do not have access to this certificate." }, { status: 403 });
    }

    const templateSnap = cert.templateId ? await a.db.collection("certificateTemplates").doc(cert.templateId).get() : null;
    const template = templateSnap?.exists ? templateSnap.data() : {};
    const config = template.config || {};

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([842, 595]); // A4 landscape points
    const { width, height } = page.getSize();
    const font = await pdf.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdf.embedFont(StandardFonts.Helvetica);

    if (template.backgroundUrl) {
      try {
        const imageResponse = await fetch(template.backgroundUrl);
        const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
        const contentType = imageResponse.headers.get("content-type") || "";
        const image = contentType.includes("png") ? await pdf.embedPng(imageBytes) : await pdf.embedJpg(imageBytes);
        page.drawImage(image, { x: 0, y: 0, width, height });
      } catch (error) {
        console.error("[certificate-pdf-api] background embed failed", { message: error?.message });
      }
    } else {
      page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
      page.drawRectangle({ x: 20, y: 20, width: width - 40, height: height - 40, borderColor: rgb(0.72, 0.11, 0.11), borderWidth: 3 });
    }

    const centerText = (text, y, size, useFont = font, color = rgb(0.1, 0.1, 0.1)) => {
      const textWidth = useFont.widthOfTextAtSize(text, size);
      page.drawText(text, { x: (width - textWidth) / 2, y, size, font: useFont, color });
    };

    // Default layout used unless the template's own config overrides a
    // field's position — kept simple per Phase 7's "do not over-engineer".
    if (!template.backgroundUrl) {
      centerText("CERTIFICATE", height - 100, 32, font, rgb(0.72, 0.11, 0.11));
      centerText(template.type || "OF COMPLETION", height - 130, 14, regularFont);
    }
    centerText(cert.metadata?.studentName || "Student", config.namePosition?.y ? height - config.namePosition.y : height - 260, 26, font);
    centerText(`has successfully completed`, height - 300, 12, regularFont, rgb(0.35, 0.35, 0.35));
    centerText(cert.metadata?.courseName || cert.title || "Course", height - 325, 18, font);
    if (cert.metadata?.completionDate) centerText(`Completion Date: ${cert.metadata.completionDate}`, height - 360, 11, regularFont, rgb(0.35, 0.35, 0.35));

    page.drawText(`Certificate ID: ${cert.certificateCode || cert.id}`, { x: 40, y: 40, size: 9, font: regularFont, color: rgb(0.4, 0.4, 0.4) });

    // QR encodes ONLY the verification URL — never student data (Phase 19).
    try {
      const origin = new URL(request.url).origin;
      const verifyUrl = `${origin}/verify/${encodeURIComponent(cert.certificateCode || cert.id)}`;
      const qrBuffer = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 120 });
      const qrImage = await pdf.embedPng(qrBuffer);
      page.drawImage(qrImage, { x: width - 160, y: 30, width: 90, height: 90 });
    } catch (error) {
      console.error("[certificate-pdf-api] qr embed failed", { message: error?.message });
    }

    const bytes = await pdf.save();
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${(cert.certificateCode || cert.id)}.pdf"`,
      },
    });
  } catch (error) {
    console.error("[certificate-pdf-api] failed", { code: error?.code || "unknown", message: error?.message });
    return NextResponse.json({ message: "Unable to generate the certificate PDF right now." }, { status: 500 });
  }
}
