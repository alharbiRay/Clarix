import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { DemoButton } from "@/components/marketing/demo-button";
import { DecisionSheet } from "@/components/marketing/decision-sheet";
import { Close, DashboardPreview, Faq, Features, HowItWorks } from "@/components/marketing/landing-sections";
import { siteUrl } from "@/lib/site";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing");
  const locale = await getLocale();
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: siteUrl("/"),
      siteName: "Clarix",
      title: t("metaTitle"),
      description: t("metaDescription"),
      locale: locale === "ar" ? "ar_SA" : "en_US",
      alternateLocale: locale === "ar" ? ["en_US"] : ["ar_SA"],
    },
    twitter: { card: "summary_large_image", title: t("metaTitle"), description: t("metaDescription") },
  };
}

export default async function LandingPage() {
  // Signed-in buyers go straight to work.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const t = await getTranslations("landing");
  return (
    <>
      <section aria-labelledby="hero-title" className="pb-4 pt-8 sm:pb-8 sm:pt-16">
        <div className="mx-auto max-w-[76rem] px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-16">
            <div className="max-w-[54rem]">
              <h1
                id="hero-title"
                className="text-balance text-[clamp(2.1rem,4.6vw,4.1rem)] font-semibold leading-[1.02] text-slate-950 ltr:tracking-[-0.038em] rtl:leading-[1.2]"
              >
                {t("title")}
              </h1>
              <p className="mt-5 max-w-[60ch] text-base leading-relaxed text-slate-600 sm:mt-6 sm:text-[1.15rem]">{t("lede")}</p>
            </div>
            <div className="flex flex-col gap-3 lg:pb-2">
              <div className="flex flex-wrap items-center gap-3">
                <DemoButton />
                <Link
                  href="/login?tab=signup"
                  className="inline-flex h-12 items-center rounded-md border border-slate-300 bg-white px-5 text-[0.95rem] font-semibold text-slate-950 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] focus-visible:ring-offset-2"
                >
                  {t("createAccount")}
                </Link>
              </div>
              <p className="text-sm text-slate-500">{t("demoNote")}</p>
            </div>
          </div>
          <div className="mt-8 sm:mt-14">
            <DecisionSheet />
          </div>
        </div>
      </section>
      <HowItWorks />
      <Features />
      <DashboardPreview />
      <Faq />
      <Close />
    </>
  );
}
