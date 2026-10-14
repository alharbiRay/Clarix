import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { reason?: string; next?: string };
}) {
  return <LoginForm reason={searchParams.reason} next={searchParams.next} />;
}
