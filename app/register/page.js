import AuthPage from "../../components/AuthPage";

export const metadata = {
  title: "Register",
  description: "Create a free Next Academy account to explore trainings and events, and enroll when you're ready.",
};

export default function RegisterPage() {
  return <AuthPage mode="register" />;
}
