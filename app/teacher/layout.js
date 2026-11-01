import OnboardingGate from "../../components/onboarding/OnboardingGate";

// Same reasoning as app/dashboard/layout.js — every /teacher/* route is
// the Teacher's login-gated workspace, never public content.
export const metadata = {
  robots: { index: false, follow: false },
};

// Profile completion + member agreement popups shown after sign-in
// (components/onboarding/OnboardingGate.jsx).
export default function TeacherLayout({ children }) {
  return <OnboardingGate>{children}</OnboardingGate>;
}
