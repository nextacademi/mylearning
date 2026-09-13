import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../../lib/server/cached-profile";
import { CERTIFICATE_TYPES } from "../../../../../lib/achievement-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const managers = new Set(["Admin", "Director"]);

function failure(stage, error) {
  console.error("[achievement-templates-api] failed", { stage, code: error?.code || "unknown" });
  return NextResponse.json({ message: `Achievement Templates API failed at ${stage}. Check the server log for the safe error code.` }, { status: 500 });
}

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
  return { db, adminUid: decoded.uid };
}

// Read is allowed to any signed-in user directly via firestore.rules
// (admin() || teacher()) — this GET exists only so the Admin dashboard can
// list templates through the same authenticated-fetch convention every
// other admin panel in this app already uses (students/teachers/shop).
export async function GET(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const snapshot = await access.db.collection("certificateTemplates").orderBy("createdAt", "desc").get();
    const templates = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json({ templates });
  } catch (error) {
    return failure("template list", error);
  }
}

export async function POST(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { name, description, templateCode, type, backgroundUrl, backgroundPath, config } = await request.json();
    if (typeof name !== "string" || !name.trim()) return NextResponse.json({ message: "Template name is required." }, { status: 400 });
    if (typeof templateCode !== "string" || !templateCode.trim()) return NextResponse.json({ message: "Template code is required." }, { status: 400 });
    if (!CERTIFICATE_TYPES.includes(type)) return NextResponse.json({ message: "Choose a valid certificate type." }, { status: 400 });

    const now = FieldValue.serverTimestamp();
    const ref = await access.db.collection("certificateTemplates").add({
      name: name.trim().slice(0, 200),
      description: typeof description === "string" ? description.trim().slice(0, 2000) : "",
      templateCode: templateCode.trim().toUpperCase().slice(0, 60),
      type,
      backgroundUrl: typeof backgroundUrl === "string" ? backgroundUrl : "",
      backgroundPath: typeof backgroundPath === "string" ? backgroundPath : "",
      // Configuration is deliberately a loose object (position/visibility of
      // each field on the certificate face) rather than a rigid schema — see
      // Phase 7's "do not over-engineer": one flexible map is simpler to
      // manage than a dozen named columns.
      config: config && typeof config === "object" ? config : {},
      status: "active",
      createdBy: access.adminUid,
      createdAt: now,
      updatedAt: now,
    });
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return failure("template create", error);
  }
}

export async function PATCH(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { id, name, description, templateCode, type, backgroundUrl, backgroundPath, config, status } = await request.json();
    if (typeof id !== "string" || !id) return NextResponse.json({ message: "Template ID is required." }, { status: 400 });
    const ref = access.db.collection("certificateTemplates").doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) return NextResponse.json({ message: "Template not found." }, { status: 404 });

    const update = { updatedAt: FieldValue.serverTimestamp() };
    if (typeof name === "string") {
      if (!name.trim()) return NextResponse.json({ message: "Template name is required." }, { status: 400 });
      update.name = name.trim().slice(0, 200);
    }
    if (typeof description === "string") update.description = description.trim().slice(0, 2000);
    if (typeof templateCode === "string") {
      if (!templateCode.trim()) return NextResponse.json({ message: "Template code is required." }, { status: 400 });
      update.templateCode = templateCode.trim().toUpperCase().slice(0, 60);
    }
    if (type !== undefined) {
      if (!CERTIFICATE_TYPES.includes(type)) return NextResponse.json({ message: "Choose a valid certificate type." }, { status: 400 });
      update.type = type;
    }
    if (typeof backgroundUrl === "string") update.backgroundUrl = backgroundUrl;
    if (typeof backgroundPath === "string") update.backgroundPath = backgroundPath;
    if (config && typeof config === "object") update.config = config;
    if (status === "active" || status === "inactive") update.status = status;

    await ref.update(update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("template update", error);
  }
}

export async function DELETE(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { id } = await request.json();
    if (typeof id !== "string" || !id) return NextResponse.json({ message: "Template ID is required." }, { status: 400 });
    // A template referenced by any course must not be deleted out from under
    // it (that course would then silently fail Certificate Settings
    // validation on its next save) — deactivate instead, mirroring how
    // products are deactivated rather than deleted once ordered.
    const inUse = await access.db.collection("courses").where("certificateTemplateId", "==", id).limit(1).get();
    if (!inUse.empty) return NextResponse.json({ message: "This template is used by a course. Set it to Inactive instead of deleting it." }, { status: 400 });
    await access.db.collection("certificateTemplates").doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("template delete", error);
  }
}
