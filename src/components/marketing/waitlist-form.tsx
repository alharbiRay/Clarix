"use client";

import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";
import { joinWaitlist } from "@/app/(marketing)/pricing/actions";
import { TEAM_SIZES, TIERS } from "@/lib/validations/lead";
import { cn } from "@/lib/utils";

const field =
  "mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-[0.95rem] text-slate-950 caret-[#5B4FD0] transition-colors placeholder:text-slate-400 hover:border-slate-400 focus:border-slate-950 focus:outline-none focus:ring-2 focus:ring-[#7C6FE0]/40 aria-[invalid=true]:border-amber-600";
const label = "block text-sm font-medium text-slate-800";

export function WaitlistForm({ tier, onTierChange }: { tier: string; onTierChange: (t: string) => void }) {
  const t = useTranslations("pricing");
  const tw = useTranslations("pricing.waitlist");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <div role="status" className="flex gap-3 rounded-lg border border-[#5B4FD0]/25 bg-[#7C6FE0]/[0.08] p-5">
        <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#5B4FD0] text-white">
          <Check size={15} strokeWidth={3} />
        </span>
        <p className="leading-relaxed text-slate-800">{tw("done", { email: done })}</p>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="grid gap-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const get = (k: string) => String(data.get(k) ?? "");
        const email = get("email");
        setError(null);
        start(async () => {
          const result = await joinWaitlist(
            {
              name: get("name"),
              email,
              company: get("company"),
              teamSize: (get("teamSize") || null) as never,
              tier: (tier || null) as never,
              note: get("note"),
            },
            locale
          );
          if ("error" in result && result.error) setError({ message: result.error, field: result.field });
          else setDone(email.trim());
        });
      }}
    >
      <div>
        <label htmlFor="wl-name" className={label}>{tw("name")}</label>
        <input id="wl-name" name="name" autoComplete="name" required maxLength={120} className={field} aria-invalid={error?.field === "name"} />
      </div>
      <div>
        <label htmlFor="wl-email" className={label}>{tw("email")}</label>
        <input id="wl-email" name="email" type="email" dir="ltr" autoComplete="email" required maxLength={254} className={cn(field, "text-start rtl:text-end")} aria-invalid={error?.field === "email"} />
      </div>
      <div>
        <label htmlFor="wl-company" className={label}>{tw("company")}</label>
        <input id="wl-company" name="company" autoComplete="organization" maxLength={160} className={field} />
      </div>
      <div>
        <label htmlFor="wl-size" className={label}>{tw("teamSize")}</label>
        <select id="wl-size" name="teamSize" className={field} defaultValue="">
          <option value="">—</option>
          {TEAM_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="wl-tier" className={label}>{tw("tier")}</label>
        <select id="wl-tier" value={tier} onChange={(e) => onTierChange(e.target.value)} className={field}>
          <option value="">{tw("anyTier")}</option>
          {TIERS.map((k) => (
            <option key={k} value={k}>{t(`tiers.${k}.name`)}</option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="wl-note" className={label}>{tw("note")}</label>
        <textarea id="wl-note" name="note" rows={3} maxLength={1000} className={cn(field, "resize-y")} />
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">{tw("privacy")}</p>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-slate-950 px-5 text-[0.95rem] font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-80"
        >
          {pending && <Loader2 size={16} aria-hidden className="animate-spin motion-reduce:animate-none" />}
          {pending ? tw("sending") : tw("submit")}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-medium text-amber-800 sm:col-span-2">
          {error.message}
        </p>
      )}
    </form>
  );
}
