import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { DemoEntry } from "@/components/demo/demo-entry";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("demo");
  return { title: t("pageTitle"), description: t("pageDescription") };
}

const TOUR = [1, 2, 3] as const;

export default async function DemoPage() {
  const t = await getTranslations("demo");
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-16">
      <div className="w-full max-w-md">
        <Link href="/login" className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]">
          <Logo className="h-8 w-8" />
          <span className="text-lg font-bold tracking-tight text-slate-900">Clarix</span>
        </Link>

        <h1 className="mt-10 text-balance text-3xl font-bold tracking-tight text-slate-900">
          {t("heading")}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
          {t("intro")}
        </p>

        <ol className="mt-8 space-y-5 border-s border-slate-200 ps-5">
          {TOUR.map((n) => (
            <li key={n} className="relative">
              <span
                aria-hidden
                className="absolute -start-[25px] top-1.5 h-2 w-2 rounded-full bg-[#7C6FE0] ring-4 ring-slate-50"
              />
              <p className="text-sm font-semibold text-slate-900">{t(`tour${n}Title`)}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{t(`tour${n}Body`)}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10">
          <DemoEntry prominent />
          <p className="mt-4 text-center text-sm text-slate-500">
            {t("readyForOwn")}{" "}
            <Link
              href="/login?tab=signup"
              className="font-medium text-slate-900 underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
            >
              {t("createFree")}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
