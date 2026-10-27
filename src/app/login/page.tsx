import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { reason?: string; next?: string; tab?: string };
}) {
  return <LoginForm reason={searchParams.reason} next={searchParams.next} tab={searchParams.tab} />;
}
