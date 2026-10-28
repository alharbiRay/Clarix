import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/logo";

export async function SiteFooter() {
  const t = await getTranslations("site");
  const link =
    "rounded-sm text-sm text-slate-600 underline-offset-4 transition-colors hover:text-slate-950 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]";
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-[76rem] gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div className="max-w-sm">
          <div className="flex items-center gap-2.5">
            <Logo className="h-7 w-7" />
            <span className="font-bold tracking-tight text-slate-950">Clarix</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">{t("footerLine")}</p>
        </div>
        <nav aria-label={t("product")}>
          <h2 className="text-xs font-semibold text-slate-950">{t("product")}</h2>
          <ul className="mt-3 space-y-2">
            <li><Link className={link} href="/#how">{t("howItWorks")}</Link></li>
            <li><Link className={link} href="/pricing">{t("pricing")}</Link></li>
            <li><Link className={link} href="/#faq">{t("faq")}</Link></li>
            <li><Link className={link} href="/demo">{t("tryDemo")}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t("company")}>
          <h2 className="text-xs font-semibold text-slate-950">{t("company")}</h2>
          <ul className="mt-3 space-y-2">
            <li><Link className={link} href="/login">{t("signIn")}</Link></li>
            <li><Link className={link} href="/login?tab=signup">{t("createAccount")}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-slate-100">
        <p className="mx-auto max-w-[76rem] px-4 py-5 text-xs text-slate-500 sm:px-6 lg:px-8">
          {t("rights", { year: new Date().getFullYear() })}
        </p>
      </div>
    </footer>
  );
}
