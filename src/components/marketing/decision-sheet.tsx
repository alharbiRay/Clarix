"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Clock, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoneyWhole } from "@/lib/metrics/format";
import { formatDate } from "@/lib/format";
import { isLocale } from "@/i18n/config";
import {
  DEFAULT_RULES,
  SAMPLE_QUOTES,
  decide,
  rankQuotes,
  type Priority,
  type SampleQuote,
  type SheetRules,
} from "@/lib/marketing/sample-sheet";

const PRIORITIES: Priority[] = ["price", "balanced", "speed"];
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Rows glide to their new rank (FLIP) instead of jumping: you see the decision move. */
function useFlip(order: string[]) {
  const nodes = useRef(new Map<string, HTMLElement>());
  const last = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const reduced = prefersReducedMotion();
    nodes.current.forEach((el, id) => {
      const top = el.getBoundingClientRect().top;
      const before = last.current.get(id);
      if (!reduced && before !== undefined && before !== top) {
        el.animate([{ transform: `translateY(${before - top}px)` }, { transform: "translateY(0)" }], {
          duration: 260,
          easing: EASE_OUT,
        });
      }
      last.current.set(id, top);
    });
  }, [order]);
  return (id: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(id, el);
    else nodes.current.delete(id);
  };
}

function Stepper({
  label,
  value,
  onDec,
  onInc,
  decLabel,
  incLabel,
  canDec,
  canInc,
}: {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
  decLabel: string;
  incLabel: string;
  canDec: boolean;
  canInc: boolean;
}) {
  const btn =
    "grid h-8 w-8 shrink-0 place-items-center rounded-md border border-slate-300 bg-white text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] disabled:cursor-not-allowed disabled:opacity-35";
  return (
    <div>
      <div className="text-[0.8rem] font-medium text-slate-600">{label}</div>
      <div className="mt-1.5 flex items-center gap-2">
        <button type="button" className={btn} onClick={onDec} disabled={!canDec} aria-label={decLabel}>
          <Minus size={14} aria-hidden />
        </button>
        <output className="min-w-[6.5rem] text-center text-[0.95rem] font-semibold tabular-nums text-slate-950" aria-live="polite">
          {value}
        </output>
        <button type="button" className={btn} onClick={onInc} disabled={!canInc} aria-label={incLabel}>
          <Plus size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function DecisionSheet() {
  const t = useTranslations("landing.sheet");
  const raw = useLocale();
  const locale = isLocale(raw) ? raw : "en";
  const [priority, setPriority] = useState<Priority>("balanced");
  const [rules, setRules] = useState<SheetRules>(DEFAULT_RULES);

  const ranked = useMemo(() => rankQuotes(SAMPLE_QUOTES, priority), [priority]);
  const decision = useMemo(() => decide(ranked, rules), [ranked, rules]);
  const order = ranked.map((q) => q.id);
  const ref = useFlip(order);

  // Rows that just changed rank stay marked until the next change.
  const prevOrder = useRef(order);
  const [moved, setMoved] = useState<Set<string>>(new Set());
  useEffect(() => {
    const before = prevOrder.current;
    if (before.join() !== order.join()) {
      setMoved(new Set(order.filter((id, i) => before.indexOf(id) !== i)));
      prevOrder.current = order;
    }
  }, [order]);

  const money = (n: number) => formatMoneyWhole(n, "SAR");
  const name = (q: SampleQuote) => t(`suppliers.${q.id}`);
  // Functional updates: quick repeated clicks each count.
  const setRule = (patch: (r: SheetRules) => Partial<SheetRules>) => setRules((r) => ({ ...r, ...patch(r) }));

  const outcome =
    decision.status === "approved"
      ? t("approvedDetail", { supplier: name(decision.quote), amount: money(decision.saving) })
      : decision.reason === "delivery"
        ? t("reasons.delivery", { supplier: name(decision.quote), days: decision.quote.deliveryDays, limit: rules.maxDeliveryDays })
        : decision.reason === "warranty"
          ? t("reasons.warranty", { supplier: name(decision.quote) })
          : t("reasons.spend", { amount: money(decision.quote.total), limit: money(rules.spendLimit) });
  const outcomeKey = `${decision.status}-${decision.quote.id}-${decision.status === "held" ? decision.reason : ""}`;
  const today = formatDate(new Date().toISOString(), locale);

  return (
    <section
      aria-label={t("label")}
      className="relative overflow-hidden rounded-xl border border-slate-300/80 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04),0_30px_60px_-40px_rgba(15,23,42,0.45)]"
    >
      {/* Sheet header: the document this is */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-slate-950 px-5 py-3.5 sm:px-7">
        <h2 className="text-[0.95rem] font-semibold text-slate-950">
          {t("title")} <span className="font-normal text-slate-500">· <bdi>{t("rfq")}</bdi></span>
        </h2>
        <p className="text-xs text-slate-500">{t("sample")}</p>
      </div>

      <div className="grid lg:grid-cols-[18.5rem_1fr]">
        {/* Rules: the margin of the sheet */}
        <div className="order-2 border-t border-slate-200 bg-slate-50/70 px-5 py-5 sm:px-7 lg:order-none lg:border-e lg:border-t-0">
          <h3 className="text-xs font-semibold text-slate-950">{t("rules")}</h3>

          <fieldset className="mt-4">
            <legend className="text-[0.8rem] font-medium text-slate-600">{t("priority")}</legend>
            <div className="mt-1.5 grid grid-cols-3 rounded-md border border-slate-300 bg-white p-0.5">
              {PRIORITIES.map((p) => (
                <label
                  key={p}
                  className={cn(
                    "cursor-pointer rounded-[5px] px-1 py-1.5 text-center text-[0.8rem] font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#7C6FE0]",
                    priority === p ? "bg-slate-950 text-white" : "text-slate-600 hover:text-slate-950"
                  )}
                >
                  <input type="radio" name="priority" value={p} checked={priority === p} onChange={() => setPriority(p)} className="sr-only" />
                  {t(`priorities.${p}`)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-1">
            <Stepper
              label={t("delivery")}
              value={t("days", { count: rules.maxDeliveryDays })}
              onDec={() => setRule((r) => ({ maxDeliveryDays: Math.max(3, r.maxDeliveryDays - 1) }))}
              onInc={() => setRule((r) => ({ maxDeliveryDays: Math.min(14, r.maxDeliveryDays + 1) }))}
              canDec={rules.maxDeliveryDays > 3}
              canInc={rules.maxDeliveryDays < 14}
              decLabel={t("fewer")}
              incLabel={t("more")}
            />
            <Stepper
              label={t("spend")}
              value={money(rules.spendLimit)}
              onDec={() => setRule((r) => ({ spendLimit: Math.max(40_000, r.spendLimit - 5_000) }))}
              onInc={() => setRule((r) => ({ spendLimit: Math.min(70_000, r.spendLimit + 5_000) }))}
              canDec={rules.spendLimit > 40_000}
              canInc={rules.spendLimit < 70_000}
              decLabel={t("lower")}
              incLabel={t("higher")}
            />
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={rules.requireWarranty}
            onClick={() => setRule((r) => ({ requireWarranty: !r.requireWarranty }))}
            className="mt-5 flex w-full items-center justify-between gap-3 rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]"
          >
            <span className="text-[0.8rem] font-medium text-slate-600">{t("warranty")}</span>
            <span
              aria-hidden
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                rules.requireWarranty ? "bg-slate-950" : "bg-slate-300"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.3)] transition-[inset-inline-start] duration-200",
                  rules.requireWarranty ? "start-[1.125rem]" : "start-0.5"
                )}
              />
            </span>
          </button>
        </div>

        {/* The ranked quotes */}
        <div className="order-1 min-w-0 lg:order-none">
          <div
            aria-hidden
            className="hidden grid-cols-[3rem_minmax(0,1fr)_8.5rem_6rem_6.5rem_4rem] gap-3 border-b border-slate-200 px-7 py-2.5 text-[0.7rem] font-medium text-slate-500 md:grid"
          >
            <span>{t("rank")}</span>
            <span>{t("supplier")}</span>
            <span className="text-end">{t("total")}</span>
            <span className="text-end">{t("deliveryCol")}</span>
            <span className="text-end">{t("warrantyCol")}</span>
            <span className="text-end">{t("score")}</span>
          </div>
          <ol>
            {ranked.map((q, i) => {
              const isPick = i === 0;
              const late = q.deliveryDays > rules.maxDeliveryDays;
              const noWarranty = rules.requireWarranty && q.warrantyMonths === 0;
              const overSpend = q.total > rules.spendLimit;
              return (
                <li
                  key={q.id}
                  ref={ref(q.id)}
                  className={cn(
                    "relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-b border-slate-100 px-5 py-4 last:border-b-0 sm:px-7 md:grid-cols-[3rem_minmax(0,1fr)_8.5rem_6rem_6.5rem_4rem] md:items-center md:gap-3",
                    isPick && "bg-[#7C6FE0]/[0.06]"
                  )}
                >
                  <span
                    className={cn(
                      "row-span-2 text-2xl font-semibold tabular-nums leading-none md:row-span-1",
                      moved.has(q.id) ? "text-[#5B4FD0]" : "text-slate-500",
                      isPick && "text-slate-950"
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-slate-950">
                      <bdi>{name(q)}</bdi>
                    </p>
                    {isPick && (
                      <p className="mt-0.5 text-xs font-medium text-[#5B4FD0]">{t("aiPick")}</p>
                    )}
                  </div>
                  <dl className="col-start-2 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm min-[440px]:grid-cols-4 min-[440px]:gap-x-2 md:col-span-4 md:col-start-auto md:grid-cols-[8.5rem_6rem_6.5rem_4rem] md:gap-3">
                    <div className="md:text-end">
                      <dt className="text-[0.7rem] text-slate-500 md:sr-only">{t("total")}</dt>
                      <dd className={cn("whitespace-nowrap font-semibold tabular-nums", overSpend ? "text-amber-800" : "text-slate-950")}>{money(q.total)}</dd>
                    </div>
                    <div className="md:text-end">
                      <dt className="text-[0.7rem] text-slate-500 md:sr-only">{t("deliveryCol")}</dt>
                      <dd className={cn("whitespace-nowrap tabular-nums", late ? "font-semibold text-amber-800" : "text-slate-700")}>{t("days", { count: q.deliveryDays })}</dd>
                    </div>
                    <div className="md:text-end">
                      <dt className="text-[0.7rem] text-slate-500 md:sr-only">{t("warrantyCol")}</dt>
                      <dd className={cn("whitespace-nowrap tabular-nums", noWarranty ? "font-semibold text-amber-800" : "text-slate-700")}>
                        {q.warrantyMonths ? t("months", { count: q.warrantyMonths }) : t("none")}
                      </dd>
                    </div>
                    <div className="md:text-end">
                      <dt className="text-[0.7rem] text-slate-500 md:sr-only">{t("score")}</dt>
                      <dd className="tabular-nums text-slate-700">{q.score}</dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ol>

          {/* The decision, stated */}
          <div
            key={outcomeKey}
            role="status"
            className={cn(
              "outcome-lit flex flex-wrap items-start gap-3 border-t px-5 py-4 sm:px-7",
              decision.status === "approved" ? "border-[#5B4FD0]/25 bg-[#7C6FE0]/[0.08]" : "border-amber-300 bg-amber-50"
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-white",
                decision.status === "approved" ? "bg-[#5B4FD0]" : "bg-amber-600"
              )}
            >
              {decision.status === "approved" ? <Check size={14} strokeWidth={3} /> : <Clock size={14} strokeWidth={2.5} />}
            </span>
            <p className="min-w-0 flex-1 basis-[15rem] text-sm leading-relaxed text-slate-800">
              <span className={cn("font-semibold", decision.status === "approved" ? "text-[#4338CA]" : "text-amber-900")}>
                {decision.status === "approved" ? t("approved") : t("held")}
              </span>{" "}
              <bdi>{outcome}</bdi>
            </p>
            {decision.status === "approved" && (
              <span
                aria-hidden
                className="stamp-land ms-auto shrink-0 rotate-[-7deg] self-center rounded-[4px] border-2 border-[#5B4FD0] px-2.5 py-1 text-center text-[#5B4FD0] outline outline-1 outline-offset-2 outline-[#5B4FD0]/60"
              >
                <span className="block text-[0.8rem] font-bold uppercase leading-tight tracking-[0.14em] rtl:tracking-normal">{t("stamp")}</span>
                <span className="block text-[0.6rem] font-medium tabular-nums leading-tight">{today}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
