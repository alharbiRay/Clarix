import { getLocale, getTranslations } from "next-intl/server";
import { ArrowRight, Check, CircleDot, FileText, Mail, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { formatMoneyWhole, formatMonthLabel } from "@/lib/metrics/format";
import { formatMoney } from "@/lib/format";
import { isLocale } from "@/i18n/config";
import { DemoButton } from "@/components/marketing/demo-button";

const wrap = "mx-auto max-w-[76rem] px-4 sm:px-6 lg:px-8";
const h2 = "text-balance text-[clamp(1.75rem,3.2vw,2.6rem)] font-semibold leading-[1.1] text-slate-950 ltr:tracking-[-0.025em]";

/* ------------------------------------------------------------------ */
/* How it works: one RFQ's route, four stops on one rule               */
/* ------------------------------------------------------------------ */

export async function HowItWorks() {
  const t = await getTranslations("landing.how");
  const steps = [
    { key: "send", icon: Mail },
    { key: "collect", icon: FileText },
    { key: "compare", icon: CircleDot },
    { key: "approve", icon: ShieldCheck },
  ] as const;
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 py-20 sm:py-28">
      <div className={wrap}>
        <div className="max-w-2xl">
          <h2 id="how-title" className={h2}>{t("title")}</h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">{t("lede")}</p>
        </div>
        <ol className="ms-[1.125rem] mt-14 grid gap-14 border-s-2 border-slate-950 ps-9 lg:ms-0 lg:grid-cols-4 lg:gap-8 lg:border-s-0 lg:border-t-2 lg:ps-0 lg:pt-8">
          {steps.map(({ key, icon: Icon }, i) => (
            <li key={key} className="relative">
              <span
                aria-hidden
                className="absolute -start-[3.45rem] -top-1 grid h-9 w-9 place-items-center rounded-full border-2 border-slate-950 bg-slate-50 text-sm font-bold tabular-nums text-slate-950 lg:-top-[2.65rem] lg:start-0"
              >
                {i + 1}
              </span>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <Icon size={18} aria-hidden className="text-slate-400" />
                {t(`steps.${key}.title`)}
              </h3>
              <p className="mt-2 max-w-[34ch] leading-relaxed text-slate-600">{t(`steps.${key}.body`)}</p>
              <p className="mt-4 inline-flex rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[0.8rem] font-medium tabular-nums text-slate-700">
                <bdi>{t(`steps.${key}.artifact`)}</bdi>
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Features: what each one does, shown on its own material              */
/* ------------------------------------------------------------------ */

export async function Features() {
  const t = await getTranslations("landing.features");
  return (
    <section aria-labelledby="features-title" className="border-y border-slate-200 bg-white py-20 sm:py-28">
      <div className={wrap}>
        <h2 id="features-title" className={`${h2} max-w-2xl`}>{t("title")}</h2>

        {/* Extraction: the messy line, and what Clarix reads from it */}
        <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:items-center lg:gap-16">
          <div>
            <h3 className="text-xl font-semibold text-slate-950">{t("extraction.title")}</h3>
            <p className="mt-3 max-w-[52ch] leading-relaxed text-slate-600">{t("extraction.body")}</p>
            <p className="mt-5 flex max-w-[52ch] gap-2 text-sm leading-relaxed text-slate-700">
              <Sparkles size={16} aria-hidden className="mt-0.5 shrink-0 text-[#5B4FD0]" />
              {t("extraction.proof")}
            </p>
          </div>
          <figure aria-hidden>
            <div dir="rtl" lang="ar" className="border-y border-slate-300 py-4 font-[family-name:var(--font-arabic)] text-[0.98rem] leading-loose text-slate-700">
              <p>الأسعار شاملة ضريبة القيمة المضافة 15%</p>
              <p>مكيف سبليت 24000 وحدة: <span className="font-semibold text-slate-950 underline decoration-[#7C6FE0] decoration-2 underline-offset-[6px]">2,875 ريال</span></p>
              <p>التوريد والتركيب خلال <span className="font-semibold text-slate-950 underline decoration-[#7C6FE0] decoration-2 underline-offset-[6px]">7 أيام</span> · ضمان <span className="font-semibold text-slate-950 underline decoration-[#7C6FE0] decoration-2 underline-offset-[6px]">5 سنوات</span></p>
            </div>
            <div className="flex justify-center py-3 text-slate-400">
              <ArrowRight size={18} className="rotate-90" />
            </div>
            <dl className="grid grid-cols-3 divide-x divide-slate-200 border-t-2 border-slate-950 text-sm rtl:divide-x-reverse">
              {[
                [t("extraction.fig.unit"), formatMoney(2500, "SAR")],
                [t("extraction.fig.delivery"), t("extraction.fig.days")],
                [t("extraction.fig.warranty"), t("extraction.fig.years")],
              ].map(([k, v]) => (
                <div key={k} className="px-3 py-3 first:ps-0">
                  <dt className="text-[0.7rem] text-slate-500">{k}</dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-slate-950">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-1 border-t border-slate-200 pt-2.5 text-xs text-slate-600">{t("extraction.fig.warning")}</p>
          </figure>
        </div>

        {/* Compare + approval: two rules of the sheet, side by side */}
        <div className="mt-20 grid gap-12 border-t border-slate-200 pt-12 md:grid-cols-2 md:gap-16">
          <div>
            <h3 className="text-xl font-semibold text-slate-950">{t("compare.title")}</h3>
            <p className="mt-3 max-w-[48ch] leading-relaxed text-slate-600">{t("compare.body")}</p>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-950">{t("approval.title")}</h3>
            <p className="mt-3 max-w-[48ch] leading-relaxed text-slate-600">{t("approval.body")}</p>
          </div>
        </div>

        {/* Audit trail + Arabic */}
        <div className="mt-20 grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
          <div>
            <h3 className="text-xl font-semibold text-slate-950">{t("audit.title")}</h3>
            <p className="mt-3 max-w-[52ch] leading-relaxed text-slate-600">{t("audit.body")}</p>
            <ol className="mt-6 space-y-0 border-s-2 border-slate-200 ps-5">
              {(["invited", "received", "recommended", "approved"] as const).map((k, i, all) => (
                <li key={k} className="relative pb-4 last:pb-0">
                  <span
                    aria-hidden
                    className={`absolute -start-[1.72rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white ${i === all.length - 1 ? "bg-[#5B4FD0]" : "bg-slate-400"}`}
                  />
                  <p className={`text-sm ${i === all.length - 1 ? "font-semibold text-slate-950" : "text-slate-700"}`}>
                    <bdi>{t(`audit.events.${k}`)}</bdi>
                  </p>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="text-xl font-semibold text-slate-950">{t("arabic.title")}</h3>
            <p className="mt-3 max-w-[48ch] leading-relaxed text-slate-600">{t("arabic.body")}</p>
            {/* The same notice in both languages, each in its own direction. */}
            <div className="mt-6 flex flex-col items-start gap-2">
              {[
                { lang: "ar", dir: "rtl", text: "اعتماد تلقائي: أُرسل أمر الشراء إلى الراشد لمواد البناء" },
                { lang: "en", dir: "ltr", text: "Auto-approved: PO sent to Al Rashid Building Materials" },
              ].map((s) => (
                <p
                  key={s.lang}
                  lang={s.lang}
                  dir={s.dir}
                  className="inline-flex items-center gap-2 rounded-md border border-[#5B4FD0]/25 bg-[#7C6FE0]/[0.08] px-3 py-2 text-sm font-semibold text-[#4338CA]"
                >
                  <Check size={15} strokeWidth={3} aria-hidden />
                  {s.text}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard preview: the sample workspace's real shape                 */
/* ------------------------------------------------------------------ */

const MONTHS: [string, number][] = [
  ["2026-05", 23_460],
  ["2026-06", 4_311],
  ["2026-07", 23_147],
  ["2026-08", 892],
  ["2026-09", 0],
  ["2026-10", 5_887],
];

export async function DashboardPreview() {
  const t = await getTranslations("landing.preview");
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : "en";
  const max = Math.max(...MONTHS.map(([, v]) => v));
  const recent = [
    { title: "Warehouse pallets and wrap", supplier: "Red Sea Packaging Co.", total: 14_393, auto: true },
    { title: "مستلزمات تغليف للتصدير", supplier: "Al Rashid Building Materials", total: 14_521, auto: true },
    { title: "Foundation pour, Tower B", supplier: "Eastern Province Trading", total: 64_608, auto: false },
  ];
  return (
    <section aria-labelledby="preview-title" className="py-20 sm:py-28">
      <div className={`${wrap} grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-16`}>
        <div>
          <h2 id="preview-title" className={h2}>{t("title")}</h2>
          <p className="mt-4 max-w-[46ch] text-lg leading-relaxed text-slate-600">{t("body")}</p>
        </div>
        <figure className="rounded-xl border border-slate-300/80 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04),0_30px_60px_-40px_rgba(15,23,42,0.45)]">
          <figcaption className="flex items-center justify-between border-b border-slate-200 px-5 py-3 text-xs">
            <span className="font-semibold text-slate-950">Clarix</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 ring-1 ring-slate-200">{t("label")}</span>
          </figcaption>
          <div className="grid gap-6 p-5 sm:grid-cols-[1fr_1.3fr] sm:p-6">
            <div>
              <p className="text-xs text-slate-500">{t("savings")}</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-950">{formatMoneyWhole(57_697, "SAR")}</p>
              <p className="mt-4 text-xs text-slate-500">{t("rate")}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-slate-950">{t("rateValue")}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{t("months")}</p>
              <div dir="ltr" className="mt-3 flex h-28 items-end gap-2" aria-hidden>
                {MONTHS.map(([m, v]) => (
                  <div key={m} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="w-full rounded-t-[3px] bg-slate-900" style={{ height: `${Math.max(2, (v / max) * 92)}px` }} />
                    <span className="text-[0.65rem] text-slate-500">{formatMonthLabel(m, false, locale).slice(0, locale === "ar" ? undefined : 3)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-slate-200 px-5 py-4 sm:px-6">
            <p className="text-xs text-slate-500">{t("recent")}</p>
            <ul className="mt-2 divide-y divide-slate-100">
              {recent.map((r) => (
                <li key={r.title} className="flex items-center gap-3 py-2 text-sm">
                  <span dir="auto" className="min-w-0 flex-1 truncate text-start text-slate-800">{r.title}</span>
                  <span dir="auto" className="hidden truncate text-start text-slate-500 sm:block sm:max-w-[12rem]">{r.supplier}</span>
                  <span className="tabular-nums text-slate-950">{formatMoneyWhole(r.total, "SAR")}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[0.7rem] font-medium ${r.auto ? "bg-[#7C6FE0]/10 text-[#4338CA]" : "bg-slate-100 text-slate-600"}`}>
                    {r.auto ? t("auto") : t("manual")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </figure>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ and close                                                       */
/* ------------------------------------------------------------------ */

export async function Faq() {
  const t = await getTranslations("landing.faq");
  const items = [1, 2, 3, 4, 5, 6] as const;
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 border-t border-slate-200 bg-white py-20 sm:py-28">
      <div className={`${wrap} grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16`}>
        <h2 id="faq-title" className={h2}>{t("title")}</h2>
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {items.map((n) => (
            <details key={n} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-start font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] [&::-webkit-details-marker]:hidden">
                {t(`q${n}`)}
                <Plus size={18} aria-hidden className="shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none" />
              </summary>
              <p className="max-w-[62ch] pb-6 leading-relaxed text-slate-600">{t(`a${n}`)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export async function Close() {
  const t = await getTranslations("landing.close");
  return (
    <section aria-labelledby="close-title" className="py-20 sm:py-24">
      <div className={wrap}>
        <div className="flex flex-col gap-8 border-t-2 border-slate-950 pt-10 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <h2 id="close-title" className="text-balance text-[clamp(1.9rem,3.6vw,3rem)] font-semibold leading-[1.08] text-slate-950 ltr:tracking-[-0.025em]">
              {t("title")}
            </h2>
            <p className="mt-4 max-w-[52ch] text-lg leading-relaxed text-slate-600">{t("body")}</p>
          </div>
          <DemoButton />
        </div>
      </div>
    </section>
  );
}
