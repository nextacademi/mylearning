import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebase-admin";
import { getCachedUserSnapshot, invalidateUserProfileCache } from "../../../../lib/server/cached-profile";
import { ensureUserId } from "../../../../lib/server/user-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const managers = new Set(["Admin", "Director"]);
const assignableRoles = new Set(["Student", "Volunteer", "Teacher", "Admin", "Director"]);

function failure(stage, error) {
  console.error("[users-api] request failed", {
    stage,
    code: error?.code || "unknown",
  });
  const credentials = error?.message?.includes(
    "Firebase Admin credentials are not configured",
  );
  return NextResponse.json(
    {
      message: credentials
        ? "User API failed at Firebase Admin initialization. Configure the server Firebase Admin credentials."
        : "Unable to process the user-management request. Please try again.",
    },
    { status: 500 },
  );
}

async function requireManager(request) {
  const token = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return {
      denied: NextResponse.json(
        { message: "Administrator access is required." },
        { status: 401 },
      ),
    };
  }
  const auth = getAdminAuth();
  const db = getAdminDb();
  const decoded = await auth.verifyIdToken(token);
  const profile = await getCachedUserSnapshot(db, decoded.uid);
  const actor = profile.data() || {};
  if (!profile.exists || actor.active === false || !managers.has(actor.role)) {
    return {
      denied: NextResponse.json(
        { message: "Administrator access is required." },
        { status: 403 },
      ),
    };
  }
  return { db, actorUid: decoded.uid, actorRole: actor.role };
}

function dateValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

function userRow(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    uid: data.uid || snapshot.id,
    userId: data.userId || null,
    displayName: data.displayName || "",
    email: data.email || "",
    phone: data.phone || "",
    photoURL: data.photoURL || "",
    role: data.role || "",
    active: typeof data.active === "boolean" ? data.active : null,
    createdAt: dateValue(data.createdAt),
  };
}

async function listAuthUsers(auth) {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

// A sign-in account whose users/{uid} profile was never written (e.g. the
// client-side profile write failed at registration and they never signed in
// again to self-heal). Without this row they'd be invisible to managers.
function orphanRow(authUser) {
  return {
    id: authUser.uid,
    uid: authUser.uid,
    userId: null,
    displayName: authUser.displayName || "",
    email: authUser.email || "",
    phone: authUser.phoneNumber || "",
    photoURL: authUser.photoURL || "",
    role: "",
    active: !authUser.disabled,
    createdAt: authUser.metadata?.creationTime ? new Date(authUser.metadata.creationTime).toISOString() : null,
    missingProfile: true,
  };
}

export async function GET(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const [users, authUsers] = await Promise.all([
      access.db.collection("users").get(),
      listAuthUsers(getAdminAuth()),
    ]);
    const rows = users.docs.map(userRow);
    // Belt-and-suspenders backfill for any account still missing the
    // unified User ID (legacy accounts pre-dating this field) — same
    // pattern as lib/server/enrollment-core.js.
    await Promise.all(rows.filter((row) => !row.userId).map((row) => ensureUserId(access.db, row.id).then((userId) => { row.userId = userId; })));
    const profileIds = new Set(rows.map((row) => row.id));
    rows.push(...authUsers.filter((authUser) => !profileIds.has(authUser.uid)).map(orphanRow));
    return NextResponse.json({
      users: rows.sort((a, b) => (a.displayName || a.email || a.uid).localeCompare(b.displayName || b.email || b.uid)),
    });
  } catch (error) {
    return failure("user-list request", error);
  }
}

// Fixes a mistyped name/phone. Kept in the profile doc and, for the name,
// the Auth account too, so both stay in sync. Same Director rule as role
// changes: only a Director may edit a Director.
async function updateDetails(access, body) {
  const { uid } = body;
  if (typeof uid !== "string" || !uid) {
    return NextResponse.json({ message: "User ID is required." }, { status: 400 });
  }
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!displayName) return NextResponse.json({ message: "Enter a name." }, { status: 400 });
  if (displayName.length > 100) return NextResponse.json({ message: "Name can be up to 100 characters." }, { status: 400 });
  if (phone.length > 30) return NextResponse.json({ message: "Phone can be up to 30 characters." }, { status: 400 });

  const targetRef = access.db.collection("users").doc(uid);
  const target = await targetRef.get();
  if (!target.exists) {
    return NextResponse.json({ message: "This account has no profile yet — set its role first." }, { status: 404 });
  }
  if (access.actorRole !== "Director" && target.data().role === "Director") {
    return NextResponse.json({ message: "Only a Director can edit another Director." }, { status: 403 });
  }
  await targetRef.update({ displayName, phone, updatedAt: FieldValue.serverTimestamp() });
  try {
    await getAdminAuth().updateUser(uid, { displayName });
  } catch (authError) {
    if (authError?.code !== "auth/user-not-found") throw authError;
  }
  await invalidateUserProfileCache(uid);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const body = await request.json();
    if (body?.action === "details") return await updateDetails(access, body);
    const { uid, role } = body;
    if (typeof uid !== "string" || !uid) {
      return NextResponse.json({ message: "User ID is required." }, { status: 400 });
    }
    if (typeof role !== "string" || !assignableRoles.has(role)) {
      return NextResponse.json({ message: "Choose a valid role." }, { status: 400 });
    }
    if (uid === access.actorUid) {
      return NextResponse.json(
        { message: "You cannot change your own role." },
        { status: 400 },
      );
    }

    const targetRef = access.db.collection("users").doc(uid);
    const target = await targetRef.get();
    if (!target.exists) {
      // Sign-in account with no profile: choosing a role creates the
      // profile, same shape as a self-registered one (auth-context.js).
      let authUser;
      try {
        authUser = await getAdminAuth().getUser(uid);
      } catch (authError) {
        if (authError?.code === "auth/user-not-found") {
          return NextResponse.json({ message: "User not found." }, { status: 404 });
        }
        throw authError;
      }
      if (access.actorRole !== "Director" && role === "Director") {
        return NextResponse.json(
          { message: "Only a Director can assign the Director role." },
          { status: 403 },
        );
      }
      const now = FieldValue.serverTimestamp();
      await targetRef.create({
        uid,
        email: authUser.email || "",
        displayName: authUser.displayName || "",
        photoURL: authUser.photoURL || "",
        role,
        status: "active",
        createdAt: authUser.metadata?.creationTime ? new Date(authUser.metadata.creationTime) : now,
        updatedAt: now,
      });
      await ensureUserId(access.db, uid);
      await invalidateUserProfileCache(uid);
      return NextResponse.json({ ok: true, created: true });
    }
    const currentRole = target.data().role;
    if (access.actorRole !== "Director" && currentRole === "Director") {
      return NextResponse.json(
        { message: "Only a Director can change another Director's role." },
        { status: 403 },
      );
    }
    if (access.actorRole !== "Director" && role === "Director") {
      return NextResponse.json(
        { message: "Only a Director can assign the Director role." },
        { status: 403 },
      );
    }
    if (currentRole === role) {
      return NextResponse.json({ ok: true, unchanged: true });
    }
    if (currentRole === "Director" && role !== "Director") {
      const directors = await access.db
        .collection("users")
        .where("role", "==", "Director")
        .get();
      if (directors.size <= 1) {
        return NextResponse.json(
          { message: "This is the only Director account and its role cannot be changed." },
          { status: 400 },
        );
      }
    }
    await targetRef.update({ role, updatedAt: FieldValue.serverTimestamp() });
    await invalidateUserProfileCache(uid);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("role update", error);
  }
}

// Deletes the account itself (Firebase Auth user + the users/{uid} profile
// doc) — the same two places createStudent/createUser etc. create on
// signup. Deliberately does NOT cascade-delete this person's historical
// records (enrollments, submissions, attendance, certificates, ...): those
// stay as real academic/audit history, exactly like a "Rejected" or
// deactivated account already leaves its trail untouched elsewhere in this
// app. Same safety rules as PATCH above (no self-action, only a Director
// may touch a Director, never the last remaining Director).
export async function DELETE(request) {
  try {
    const access = await requireManager(request);
    if (access.denied) return access.denied;
    const { uid } = await request.json();
    if (typeof uid !== "string" || !uid) {
      return NextResponse.json({ message: "User ID is required." }, { status: 400 });
    }
    if (uid === access.actorUid) {
      return NextResponse.json({ message: "You cannot delete your own account." }, { status: 400 });
    }

    const targetRef = access.db.collection("users").doc(uid);
    const target = await targetRef.get();
    // No profile doc is fine (a sign-in account that never got one) — the
    // Auth account below is still deleted.
    const currentRole = target.exists ? target.data().role : "";
    if (access.actorRole !== "Director" && currentRole === "Director") {
      return NextResponse.json({ message: "Only a Director can delete another Director's account." }, { status: 403 });
    }
    if (currentRole === "Director") {
      const directors = await access.db.collection("users").where("role", "==", "Director").get();
      if (directors.size <= 1) {
        return NextResponse.json({ message: "This is the only Director account and cannot be deleted." }, { status: 400 });
      }
    }

    const auth = getAdminAuth();
    try {
      await auth.deleteUser(uid);
    } catch (authError) {
      // Already gone from Auth (e.g. a retry) — still proceed to remove the
      // orphaned Firestore doc rather than leaving it stranded.
      if (authError?.code !== "auth/user-not-found") throw authError;
    }
    await targetRef.delete();
    await invalidateUserProfileCache(uid);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure("user deletion", error);
  }
}
