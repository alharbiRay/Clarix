"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { TIERS } from "@/lib/validations/lead";
import { formatMoneyWhole } from "@/lib/metrics/format";
import { WaitlistForm } from "@/components/marketing/waitlist-form";
import { cn } from "@/lib/utils";

/** Illustrative prices (labeled on the page): SAR per month, excluding VAT. */
const PRICE: Record<(typeof TIERS)[number], number> = { starter: 0, team: 349, business: 990 };

export function PricingSheet() {
  const t = useTranslations("pricing");
  const [tier, setTier] = useState("");
  const formRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-300/80 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04),0_30px_60px_-40px_rgba(15,23,42,0.45)]">
        <ul className="grid divide-y divide-slate-200 md:grid-cols-3 md:divide-x md:divide-y-0 rtl:md:divide-x-reverse">
          {TIERS.map((k) => {
            const featured = k === "team";
            return (
              <li key={k} className={cn("relative flex flex-col p-6 sm:p-8", featured && "bg-[#7C6FE0]/[0.05]")}>
                {featured && (
                  <span className="absolute end-5 top-5 rotate-[-6deg] rounded-[4px] border-2 border-[#5B4FD0] px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[#5B4FD0] outline outline-1 outline-offset-2 outline-[#5B4FD0]/60 rtl:tracking-normal">
                    {t("popular")}
                  </span>
                )}
                <h2 className="text-lg font-semibold text-slate-950">{t(`tiers.${k}.name`)}</h2>
                <p className="mt-1 min-h-[2.5rem] text-sm text-slate-600">{t(`tiers.${k}.for`)}</p>
                <p className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-[2.4rem] font-semibold leading-none tabular-nums text-slate-950 ltr:tracking-[-0.03em]">
                    {PRICE[k] === 0 ? t("free") : formatMoneyWhole(PRICE[k], "SAR")}
                  </span>
                  {PRICE[k] > 0 && <span className="text-sm text-slate-500">{t("perMonth")}</span>}
                </p>
                <ul className="mt-7 flex-1 space-y-3 border-t border-slate-200 pt-6">
                  {(["f1", "f2", "f3", "f4"] as const).map((f) => (
                    <li key={f} className="flex gap-2.5 text-[0.95rem] text-slate-700">
                      <Check size={17} aria-hidden className="mt-0.5 shrink-0 text-[#5B4FD0]" />
                      {t(`tiers.${k}.${f}`)}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    setTier(k);
                    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                    formRef.current?.querySelector<HTMLInputElement>("#wl-name")?.focus({ preventScroll: true });
                  }}
                  className={cn(
                    "mt-8 inline-flex h-11 items-center justify-center rounded-md px-4 text-[0.95rem] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] focus-visible:ring-offset-2",
                    featured ? "bg-slate-950 text-white hover:bg-slate-800" : "border border-slate-300 bg-white text-slate-950 hover:border-slate-400 hover:bg-slate-50"
                  )}
                >
                  {t("choose", { tier: t(`tiers.${k}.name`) })}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div ref={formRef} id="waitlist" className="mt-20 grid scroll-mt-24 gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <h2 className="text-balance text-[clamp(1.6rem,2.8vw,2.2rem)] font-semibold leading-[1.15] text-slate-950 ltr:tracking-[-0.02em]">
            {t("waitlist.title")}
          </h2>
          <p className="mt-3 max-w-[44ch] leading-relaxed text-slate-600">{t("waitlist.body")}</p>
        </div>
        <WaitlistForm tier={tier} onTierChange={setTier} />
      </div>
    </>
  );
}
