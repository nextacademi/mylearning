// Firebase Auth rejects passwords shorter than 6 characters and the limit
// can't be lowered. To allow short PINs (4+ characters), anything under 6
// characters is padded with a fixed suffix before it reaches Firebase. Every
// place that sends a password to Firebase must go through toAuthPassword so
// sign-up, sign-in and password changes all agree on the stored value.
export const MIN_PASSWORD_LENGTH = 4;
const FIREBASE_MIN_LENGTH = 6;
const PIN_SUFFIX = "#nxA";

export function toAuthPassword(password) {
  const value = typeof password === "string" ? password : "";
  return value.length >= MIN_PASSWORD_LENGTH && value.length < FIREBASE_MIN_LENGTH ? `${value}${PIN_SUFFIX}` : value;
}
