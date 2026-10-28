import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { DemoBanner } from "@/components/demo/demo-banner";
import { getLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/config";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const t = await getTranslations("demo");

  const [{ data: profile }, { count: unreadCount }] = await Promise.all([
    supabase.from("profiles").select("full_name, is_demo, locale").eq("id", user.id).single(),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("buyer_id", user.id)
      .is("read_at", null),
  ]);

  // Emails and background recommendations use profiles.locale. A buyer who
  // never touched the switcher (Arabic from their browser) gets it saved here,
  // once. The demo profile is read-only, so it's skipped.
  if (profile && !profile.is_demo && !isLocale(profile.locale)) {
    const current = await getLocale();
    if (isLocale(current)) {
      const { error } = await supabase.from("profiles").update({ locale: current }).eq("id", user.id);
      if (error) console.error("[dashboard] couldn't save locale:", error.message);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 print:bg-white">
      <AppSidebar email={user.email!} fullName={profile?.full_name ?? null} />
      <div className="ms-60 print:ms-0">
        {profile?.is_demo && <DemoBanner />}
        {profile?.is_demo && (
          <p className="mb-3 hidden text-xs font-medium text-slate-600 print:block">{t("printNote")}</p>
        )}
        <AppTopbar unreadCount={unreadCount ?? 0} />
        <main className="p-8 print:p-0">{children}</main>
      </div>
    </div>
  );
}
