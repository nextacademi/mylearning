import { signInWithCustomToken, signOut } from "firebase/auth";
import { auth } from "../firebase";
import { homeFor } from "../impersonation-shared";

async function call(body) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const response = await fetch("/api/admin/impersonate", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to switch accounts.");
  return data;
}

// The way back saved at "Log in as" time: { targetUid, logId, returnKey,
// returnKeyExpiresAt, staffName }. The session's own `impersonatedBy` claim
// is the primary signal, but Firebase can re-issue the ID token without it,
// and this keeps "Return to my account" working when that happens.
const TICKET_KEY = "na.impersonation";

function readTicket() {
  try {
    return JSON.parse(localStorage.getItem(TICKET_KEY) || "null");
  } catch {
    return null;
  }
}

function clearTicket() {
  try {
    localStorage.removeItem(TICKET_KEY);
  } catch {
    // storage blocked — nothing saved to clear
  }
}

function ticketFor(user) {
  const ticket = readTicket();
  if (!user || ticket?.targetUid !== user.uid) return null;
  if (!(ticket.returnKeyExpiresAt > Date.now())) {
    clearTicket();
    return null;
  }
  return ticket;
}

// { staffName } while this session is an Admin/Director logged in as
// someone else, otherwise null.
export async function getImpersonation(user = auth?.currentUser) {
  if (!user) return null;
  const claims = await user.getIdTokenResult().then((result) => result.claims).catch(() => ({}));
  const ticket = ticketFor(user);
  if (!claims.impersonatedBy && !ticket) return null;
  return { staffName: claims.impersonatorName || ticket?.staffName || "staff" };
}

// Both directions finish with a full page load (not client navigation) so no
// in-memory cache from the previous account — admin lists, prefetched data —
// survives into the next one.
export async function loginAsUser(uid) {
  const { token, role, logId, returnKey, returnKeyExpiresAt, staffName } = await call({ uid });
  await signInWithCustomToken(auth, token);
  try {
    localStorage.setItem(TICKET_KEY, JSON.stringify({ targetUid: uid, logId, returnKey, returnKeyExpiresAt, staffName }));
  } catch {
    // storage blocked — the session claim alone still leads back
  }
  window.location.assign(homeFor(role));
}

export async function returnToStaffAccount() {
  const ticket = ticketFor(auth?.currentUser);
  const { token, role } = await call({ action: "exit", logId: ticket?.logId, returnKey: ticket?.returnKey });
  await signInWithCustomToken(auth, token);
  clearTicket();
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload on purpose (see above)
  window.location.assign(`${homeFor(role)}?tab=User`);
}

// Ends the session outright, impersonated or not.
export async function signOutCompletely() {
  clearTicket();
  if (auth) await signOut(auth);
}
