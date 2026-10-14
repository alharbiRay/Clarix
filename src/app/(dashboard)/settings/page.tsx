import { createClient } from "@/lib/supabase/server";
import { FadeIn } from "@/components/motion";
import { AutoApprovalToggle } from "@/components/settings/auto-approval-toggle";
import { PriceAlertForm } from "@/components/settings/price-alert-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("auto_approval_enabled, price_alert_threshold")
    .eq("id", user!.id)
    .single();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Preferences that apply across all your RFQs.
        </p>
      </FadeIn>

      <FadeIn delay={0.03}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Auto-approval</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              When an AI recommendation is ready, automatically approve and
              send a PO to the winning supplier if they&apos;re the cheapest
              complete quote, deliver within 14 days, and offer a warranty.
              Anything else is flagged for your review instead — nothing is
              ever auto-sent without meeting all three conditions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AutoApprovalToggle
              initialEnabled={profile?.auto_approval_enabled ?? true}
            />
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.06}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Price alerts</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              On the comparison page, each quoted price is checked against that supplier&apos;s last price
              for the same item and against the recent market average. Changes at or above this threshold
              are highlighted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PriceAlertForm initialPercent={Math.round(Number(profile?.price_alert_threshold ?? 0.1) * 100)} />
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
