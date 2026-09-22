import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot } from "../../../../lib/server/cached-profile";

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
  if (!profile.exists || data.active === false) return { denied: NextResponse.json({ message: "Account access is required." }, { status: 403 }) };
  return { db, uid: decoded.uid, role: data.role || "", name: data.displayName || data.email || "" };
}

// Every turn a user has with the floating AI Assistant (components/
// ai-assistant/AiAssistantPanel.jsx) gets logged here — question + answer,
// who asked, when — separate from `aiAuditLog` (which only records
// mutating actions the assistant actually performed). This is what lets
// Director/Admin see what people are asking the AI and follow up with
// them directly (Chat -> AI Assistant tab -> "Follow up" opens a real
// conversation with that user). Identity is always the verified token,
// never trusted from the request body.
export async function POST(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const body = await request.json();
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 2000) : "";
    const answer = typeof body.answer === "string" ? body.answer.trim().slice(0, 4000) : "";
    if (!question) return NextResponse.json({ message: "A question is required." }, { status: 400 });
    const ref = await a.db.collection("aiAssistantConversations").add({
      userId: a.uid,
      userName: a.name,
      userRole: a.role,
      question,
      answer,
      followUpBy: null,
      followUpAt: null,
      createdAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    console.error("[ai-conversations-api] write failed", { code: error?.code || "unknown" });
    return NextResponse.json({ message: "Unable to log this conversation turn." }, { status: 500 });
  }
}

// Admin/Director see every user's questions; anyone else sees only their
// own history (mirrors the aiAuditLog visibility model exactly).
export async function GET(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    const query = managers.has(a.role) ? a.db.collection("aiAssistantConversations") : a.db.collection("aiAssistantConversations").where("userId", "==", a.uid);
    const snapshot = await query.get();
    const rows = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .map((row) => ({
        ...row,
        createdAt: row.createdAt?.toDate ? row.createdAt.toDate().toISOString() : null,
        followUpAt: row.followUpAt?.toDate ? row.followUpAt.toDate().toISOString() : null,
      }))
      .sort((left, right) => (right.createdAt || "").localeCompare(left.createdAt || ""))
      .slice(0, 200);
    return NextResponse.json({ conversations: rows });
  } catch (error) {
    console.error("[ai-conversations-api] list failed", { code: error?.code || "unknown" });
    return NextResponse.json({ message: "Unable to load AI assistant conversations." }, { status: 500 });
  }
}

// Marks one turn as followed-up (Director/Admin only) — a lightweight
// receipt so the admin list can show which questions have already been
// handled, separate from actually messaging the user (that's the real
// Chat system, started via lib/chat-data.js's createConversationIfMissing
// from the client once this call succeeds).
export async function PATCH(request) {
  try {
    const a = await access(request);
    if (a.denied) return a.denied;
    if (!managers.has(a.role)) return NextResponse.json({ message: "Administrator access is required." }, { status: 403 });
    const { id } = await request.json();
    if (typeof id !== "string" || !id) return NextResponse.json({ message: "Conversation ID is required." }, { status: 400 });
    await a.db.collection("aiAssistantConversations").doc(id).update({ followUpBy: a.uid, followUpAt: FieldValue.serverTimestamp() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[ai-conversations-api] follow-up failed", { code: error?.code || "unknown" });
    return NextResponse.json({ message: "Unable to mark this as followed up." }, { status: 500 });
  }
}
