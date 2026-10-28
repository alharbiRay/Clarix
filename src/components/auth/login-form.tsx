"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { syncLocaleAfterSignIn } from "@/app/locale-actions";
import { LanguageSwitcher } from "@/components/language-switcher";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FadeIn } from "@/components/motion";
import { Logo } from "@/components/logo";
import { safeNextPath } from "@/lib/auth/safe-redirect";
import { DemoEntry } from "@/components/demo/demo-entry";

/** Message for /login?reason=… — set by src/middleware.ts when the session check fails. */
const REASONS: Record<string, "reasonSessionUnavailable" | "reasonDemoUnavailable"> = {
  session_unavailable: "reasonSessionUnavailable",
  demo_unavailable: "reasonDemoUnavailable",
};

export function LoginForm({ reason, next, tab }: { reason?: string; next?: string; tab?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const t = useTranslations("auth");

  async function handleSignIn(formData: FormData) {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(formData.get("email")),
      password: String(formData.get("password")),
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    try {
      await syncLocaleAfterSignIn();
    } catch (e) {
      console.error("[login] language sync failed:", e);
    }
    router.push(safeNextPath(next));
    router.refresh();
  }

  async function handleSignUp(formData: FormData) {
    setLoading(true);
    const { error, data } = await supabase.auth.signUp({
      email: String(formData.get("email")),
      password: String(formData.get("password")),
      options: {
        data: { full_name: String(formData.get("full_name") ?? "") },
        // Prefer the canonical app URL over location.origin — if the app is
        // still reachable at an old domain (e.g. a bookmarked Vercel
        // preview/production URL) alongside the real one, location.origin
        // would send confirmation links to whichever domain the user
        // happened to load this page from instead of the real site.
        emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.session) {
      router.push("/dashboard");
      router.refresh();
    } else {
      toast.success(t("checkEmail"));
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <LanguageSwitcher className="absolute end-4 top-4" />
      <FadeIn className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex items-center justify-center gap-2.5">
            <Logo className="h-9 w-9" />
            <span className="text-2xl font-bold tracking-tight">Clarix</span>
          </div>
          <p className="text-sm text-slate-500">{t("tagline")}</p>
        </div>

        {reason && REASONS[reason] && (
          <p
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            {t(REASONS[reason])}
          </p>
        )}

        <Tabs defaultValue={tab === "signup" ? "signup" : "signin"}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">{t("signIn")}</TabsTrigger>
            <TabsTrigger value="signup">{t("createAccount")}</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <Card>
              <CardHeader>
                <CardTitle>{t("welcomeBack")}</CardTitle>
                <CardDescription>
                  {t("signInHint")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form action={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("email")}</Label>
                    <Input id="email" name="email" type="email" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">{t("password")}</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      required
                    />
                  </div>
                  <Button className="w-full" disabled={loading}>
                    {loading ? t("signingIn") : t("signIn")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="signup">
            <Card>
              <CardHeader>
                <CardTitle>{t("createTitle")}</CardTitle>
                <CardDescription>
                  {t("createHint")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form action={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">{t("fullName")}</Label>
                    <Input id="full_name" name="full_name" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">{t("email")}</Label>
                    <Input
                      id="signup-email"
                      name="email"
                      type="email"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">{t("password")}</Label>
                    <Input
                      id="signup-password"
                      name="password"
                      type="password"
                      minLength={8}
                      required
                    />
                  </div>
                  <Button className="w-full" disabled={loading}>
                    {loading ? t("creatingAccount") : t("createAccount")}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DemoEntry />
      </FadeIn>
    </div>
  );
}
