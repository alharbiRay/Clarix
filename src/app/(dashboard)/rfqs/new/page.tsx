import { getTranslations } from "next-intl/server";
import { RfqForm } from "@/components/rfq-form";
import { FadeIn } from "@/components/motion";

export default async function NewRfqPage() {
  const t = await getTranslations("rfqForm");
  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <FadeIn>
        <h1 className="text-2xl font-bold tracking-tight">{t("pageTitle")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("pageSubtitle")}</p>
      </FadeIn>
      <FadeIn delay={0.03}>
        <RfqForm />
      </FadeIn>
    </div>
  );
}
