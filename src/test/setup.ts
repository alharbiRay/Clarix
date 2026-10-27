import "@testing-library/jest-dom/vitest";

// Never let a test talk to a real service. Any code path that forgets to
// mock Gemini/Resend/Supabase fails on a missing key instead of making a
// network call with production credentials.
for (const key of [
  "GEMINI_API_KEY",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
]) {
  delete process.env[key];
}
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
