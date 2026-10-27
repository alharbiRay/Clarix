import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { DemoBanner } from "@/components/demo/demo-banner";

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

  const [{ data: profile }, { count: unreadCount }] = await Promise.all([
    supabase.from("profiles").select("full_name, is_demo").eq("id", user.id).single(),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("buyer_id", user.id)
      .is("read_at", null),
  ]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppSidebar email={user.email!} fullName={profile?.full_name ?? null} />
      <div className="ml-60">
        {profile?.is_demo && <DemoBanner />}
        <AppTopbar unreadCount={unreadCount ?? 0} />
        <main className="p-8">{children}</main>
      </div>
    </div>
  );
}
