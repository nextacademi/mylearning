import { auth } from "./firebase";

// Proxied through /api/admin/training/thumbnail (Admin SDK) rather than a
// direct client Storage write — see storage.rules' courses/{courseId}
// /thumbnail block for why the cross-service Firestore role lookup a direct
// write would need is unreliable in this project.
export async function uploadCourseThumbnail(courseId, file) {
  const token = await auth?.currentUser?.getIdToken();
  if (!token) throw new Error("Your session has expired. Please sign in again.");
  const form = new FormData();
  form.append("courseId", courseId);
  form.append("file", file);
  const response = await fetch("/api/admin/training/thumbnail", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Unable to upload the thumbnail image.");
  return { thumbnailUrl: data.thumbnailUrl, thumbnailPath: data.thumbnailPath };
}
