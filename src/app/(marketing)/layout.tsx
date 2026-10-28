import { getTranslations } from "next-intl/server";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

/** Public pages: the landing page and pricing. No app shell, no session needed. */
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("site");
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 selection:bg-[#7C6FE0]/25 selection:text-slate-950">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-slate-950 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
      >
        {t("skip")}
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}
