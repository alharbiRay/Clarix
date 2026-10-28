"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { updatePriceAlertThreshold } from "@/app/(dashboard)/settings/actions";
import { Button } from "@/components/ui/button";

export function PriceAlertForm({ initialPercent }: { initialPercent: number }) {
  const t = useTranslations("priceAlert");
  const [value, setValue] = useState(String(initialPercent));
  const [saved, setSaved] = useState(initialPercent);
  const [touched, setTouched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 100;

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        startTransition(async () => {
          const result = await updatePriceAlertThreshold(parsed);
          if (result.error) toast.error(result.error);
          else {
            setSaved(parsed);
            toast.success(t("saved", { pct: parsed }));
          }
        });
      }}
    >
      <div>
        <label htmlFor="price-alert" className="text-xs font-medium text-slate-600">
          {t("label")}
        </label>
        <div className="mt-1 flex items-center gap-2">
          <input
            id="price-alert"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && !valid}
            aria-describedby="price-alert-help"
            className="h-9 w-20 rounded-md border border-slate-200 bg-white px-3 text-sm tabular focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C6FE0]"
          />
          <span className="text-sm text-slate-600">%</span>
        </div>
      </div>
      <Button type="submit" size="sm" className="h-9" disabled={!valid || isPending || parsed === saved}>
        {isPending ? t("saving") : t("save")}
      </Button>
      <p
        id="price-alert-help"
        aria-live="polite"
        className={touched && !valid ? "w-full text-xs text-red-700" : "w-full text-xs text-slate-500"}
      >
        {touched && !valid ? t("error") : t("help")}
      </p>
    </form>
  );
}
