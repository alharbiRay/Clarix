import { createClient } from "@/lib/supabase/server";
import { FadeIn } from "@/components/motion";
import { ApprovalPolicyForm } from "@/components/settings/approval-policy-form";
import { loadApprovalPolicy } from "@/lib/approval/policy";
import { loadPreviewCases } from "@/lib/approval/preview-data";
import { DEFAULT_POLICY } from "@/lib/approval/rules";
import type { PreviewCase } from "@/lib/approval/preview";
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

  const policy = await loadApprovalPolicy(supabase, user!.id, profile?.auto_approval_enabled).catch(() => ({
    ...DEFAULT_POLICY,
    enabled: profile?.auto_approval_enabled !== false,
  }));
  // The preview is a convenience: if it can't load, the form still works.
  let cases: PreviewCase[] = [];
  let currency = "SAR";
  let previewUnavailable = false;
  try {
    ({ cases, currency } = await loadPreviewCases(supabase, user!.id));
  } catch (e) {
    console.error("[settings] approval preview failed:", e);
    previewUnavailable = true;
  }

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
            <CardTitle className="text-sm font-semibold">Approval rules</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Decide which recommendations Clarix may approve on its own. Every
              automatic decision is recorded with the rule that allowed it in
              the RFQ&apos;s decision history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApprovalPolicyForm
              initial={policy}
              cases={cases}
              currency={currency}
              previewUnavailable={previewUnavailable}
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
