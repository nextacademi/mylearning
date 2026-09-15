// Same reasoning as app/dashboard/layout.js — every /teacher/* route is
// the Teacher's login-gated workspace, never public content.
export const metadata = {
  robots: { index: false, follow: false },
};

export default function TeacherLayout({ children }) {
  return children;
}
