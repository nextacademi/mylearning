import AuthPage from "../../components/AuthPage";

export const metadata = {
  title: "Log In",
  description: "Log in to your Next Academy account to access your courses, events, and dashboard.",
};

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
