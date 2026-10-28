"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Languages } from "lucide-react";
import { setLocale } from "@/app/locale-actions";
import { cn } from "@/lib/utils";

/** Toggles Arabic / English. Shows the language you'd switch TO, written in that language. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("language");
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = locale === "ar" ? "en" : "ar";

  return (
    <button
      type="button"
      disabled={pending}
      lang={next}
      onClick={() =>
        start(async () => {
          await setLocale(next);
          router.refresh();
        })
      }
      aria-label={t("switchTo")}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] disabled:opacity-60",
        className
      )}
    >
      <Languages size={16} aria-hidden="true" />
      {next === "ar" ? "العربية" : "English"}
    </button>
  );
}
