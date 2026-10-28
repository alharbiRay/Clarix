import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { DemoButton } from "@/components/marketing/demo-button";

export async function SiteHeader() {
  const t = await getTranslations("site");
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-sm supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-16 max-w-[76rem] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]" aria-label={t("home")}>
          <Logo className="h-8 w-8" />
          <span className="text-[1.05rem] font-bold tracking-tight text-slate-950">Clarix</span>
        </Link>
        <nav aria-label={t("nav")} className="hidden items-center gap-1 md:flex">
          {[
            { href: "/#how", label: t("howItWorks") },
            { href: "/pricing", label: t("pricing") },
            { href: "/#faq", label: t("faq") },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-1 sm:gap-2">
          <LanguageSwitcher className="px-2 sm:px-2.5" />
          <Link
            href="/login"
            className="hidden rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] sm:inline-flex"
          >
            {t("signIn")}
          </Link>
          <DemoButton size="sm" />
        </div>
      </div>
    </header>
  );
}
