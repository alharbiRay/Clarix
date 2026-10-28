import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { PricingSheet } from "@/components/marketing/pricing-sheet";
import { siteUrl } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pricing");
  const locale = await getLocale();
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/pricing" },
    openGraph: {
      type: "website",
      url: siteUrl("/pricing"),
      siteName: "Clarix",
      title: t("metaTitle"),
      description: t("metaDescription"),
      locale: locale === "ar" ? "ar_SA" : "en_US",
    },
  };
}

export default async function PricingPage() {
  const t = await getTranslations("pricing");
  return (
    <section aria-labelledby="pricing-title" className="py-14 sm:py-20">
      <div className="mx-auto max-w-[76rem] px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h1 id="pricing-title" className="text-[clamp(2.2rem,4.6vw,3.6rem)] font-semibold leading-[1.05] text-slate-950 ltr:tracking-[-0.035em]">
              {t("title")}
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">{t("lede")}</p>
          </div>
          <p className="flex max-w-sm gap-2 border-s-0 border-t border-slate-300 pt-3 text-sm leading-relaxed text-slate-700 md:border-t-0 md:pt-0">
            <Info size={16} aria-hidden className="mt-0.5 shrink-0" />
            {t("illustrative")}
          </p>
        </div>
        <div className="mt-10">
          <PricingSheet />
        </div>
      </div>
    </section>
  );
}
