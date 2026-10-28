import { createClient } from "@/lib/supabase/server";
import { FadeIn } from "@/components/motion";
import { ApprovalPolicyForm } from "@/components/settings/approval-policy-form";
import { loadApprovalPolicy } from "@/lib/approval/policy";
import { loadPreviewCases } from "@/lib/approval/preview-data";
import type { PreviewCase } from "@/lib/approval/preview";
import { PriceAlertForm } from "@/components/settings/price-alert-form";
import { VatForm } from "@/components/settings/vat-form";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function SettingsPage() {
    const supabase = createClient();
  const t = await getTranslations("settings");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("auto_approval_enabled, price_alert_threshold, vat_rate")
    .eq("id", user!.id)
    .single();

  // On a load error, show it rather than defaults: saving defaults over the
  // real policy would quietly drop the buyer's limits.
  const policy = await loadApprovalPolicy(supabase, user!.id, profile?.auto_approval_enabled).catch((e) => {
    console.error("[settings] approval policy failed to load:", e);
    return null;
  });
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
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("subtitle")}</p>
      </FadeIn>

      <FadeIn delay={0.03}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{t("approvalTitle")}</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {t("approvalHint")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {policy ? (
              <ApprovalPolicyForm
                initial={policy}
                cases={cases}
                currency={currency}
                previewUnavailable={previewUnavailable}
              />
            ) : (
              <p role="alert" className="text-sm text-red-700">
                {t("approvalLoadError")}
              </p>
            )}
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.06}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{t("priceAlertsTitle")}</CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {t("priceAlertsHint")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PriceAlertForm initialPercent={Math.round(Number(profile?.price_alert_threshold ?? 0.1) * 100)} />
          </CardContent>
        </Card>
      </FadeIn>

      <FadeIn delay={0.09}>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{t("vatTitle")}</CardTitle>
            <CardDescription className="text-xs text-slate-500">{t("vatHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <VatForm initialPercent={Math.round(Number(profile?.vat_rate ?? 0.15) * 10000) / 100} />
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
