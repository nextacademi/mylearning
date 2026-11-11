// Training categories — the list behind the Category dropdown on Add/Edit
// Training. Server-only (`trainingCategories` has no firestore.rules match,
// so the catch-all denies every client): managers read the list through
// GET /api/admin/training and change it through
// /api/admin/training/categories. A course still stores its category as
// plain text, so deleting a category never touches trainings that use it.
const COLLECTION = "trainingCategories";

// Case-insensitive identity, so "Digital Marketing" and "digital marketing"
// can't both exist.
export const categoryKey = (name) => name.trim().toLowerCase().replace(/\s+/g, " ");

export async function loadTrainingCategories(db) {
  const snapshot = await db.collection(COLLECTION).get();
  return snapshot.docs
    .map((doc) => ({ id: doc.id, name: doc.data().name || "" }))
    .filter((item) => item.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function addTrainingCategory(db, name, createdBy, timestamp) {
  const trimmed = typeof name === "string" ? name.trim().replace(/\s+/g, " ").slice(0, 100) : "";
  if (!trimmed) throw Object.assign(new Error("Enter a category name."), { statusCode: 400 });
  const key = categoryKey(trimmed);
  const duplicate = await db.collection(COLLECTION).where("key", "==", key).limit(1).get();
  if (!duplicate.empty) throw Object.assign(new Error(`"${trimmed}" is already in the list.`), { statusCode: 400 });
  const ref = await db.collection(COLLECTION).add({ name: trimmed, key, createdBy, createdAt: timestamp });
  return { id: ref.id, name: trimmed };
}

export async function deleteTrainingCategory(db, id) {
  if (typeof id !== "string" || !id || id.includes("/")) {
    throw Object.assign(new Error("Category ID is required."), { statusCode: 400 });
  }
  await db.collection(COLLECTION).doc(id).delete();
}
