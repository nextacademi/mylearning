import { signInWithCustomToken } from "firebase/auth";
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

// Both directions finish with a full page load (not client navigation) so no
// in-memory cache from the previous account — admin lists, prefetched data —
// survives into the next one.
export async function loginAsUser(uid) {
  const { token, role } = await call({ uid });
  await signInWithCustomToken(auth, token);
  window.location.assign(homeFor(role));
}

export async function returnToStaffAccount() {
  const { token, role } = await call({ action: "exit" });
  await signInWithCustomToken(auth, token);
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload on purpose (see above)
  window.location.assign(`${homeFor(role)}?tab=User`);
}
