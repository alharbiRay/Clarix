"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import { isLocale } from "@/i18n/config";
import { addManualQuote } from "@/app/(dashboard)/rfqs/quote-actions";
import { formatMoney } from "@/lib/format";
import { sanitizeDecimalInput, sanitizeIntegerInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UploadSupplierOption } from "@/components/quote-upload-dialog";

export interface ManualQuoteItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

export function ManualQuoteDialog({
  rfqId,
  currency,
  items,
  suppliers,
}: {
  rfqId: string;
  currency: string;
  items: ManualQuoteItem[];
  suppliers: UploadSupplierOption[];
}) {
    const router = useRouter();
  const t = useTranslations("manualQuote");
  const tf = useTranslations("supplierForm");
  const tv = useTranslations("vat");
  const rawLocale = useLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<string>("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [deliveryDays, setDeliveryDays] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [warranty, setWarranty] = useState("");
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const total = useMemo(
    () =>
      items.reduce((sum, item) => {
        const price = parseFloat(prices[item.id] ?? "");
        return sum + (isNaN(price) ? 0 : price * item.quantity);
      }, 0),
    [items, prices]
  );

  function reset() {
    setSupplierId("");
    setPrices({});
    setItemNotes({});
    setDeliveryDays("");
    setPaymentTerms("");
    setWarranty("");
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierId) {
      toast.error(t("chooseSupplier"));
      return;
    }

    startTransition(async () => {
      const result = await addManualQuote(rfqId, supplierId, {
        items: items.map((item) => {
          const v = parseFloat(prices[item.id] ?? "");
          return {
            rfq_item_id: item.id,
            unit_price: isNaN(v) ? null : v,
            notes: itemNotes[item.id] || "",
          };
        }),
        delivery_days: deliveryDays ? parseInt(deliveryDays, 10) : null,
        payment_terms: paymentTerms,
        warranty,
        notes,
      });
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(t("added"));
        setOpen(false);
        reset();
        router.refresh();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!isPending) {
          setOpen(v);
          if (!v) reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <PenLine size={14} aria-hidden="true" />
          {t("trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="manual-supplier">{t("supplier")}</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger id="manual-supplier">
                <SelectValue placeholder={t("supplierPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <bdi>{s.label}</bdi>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suppliers.length === 0 && (
              <p className="text-xs text-slate-400">
                {t("allQuoted")}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-xs text-slate-500">
              {t("prices", { currency })}
            </Label>
            {items.map((item, i) => {
              const price = parseFloat(prices[item.id] ?? "");
              const lineTotal = isNaN(price) ? null : price * item.quantity;
              return (
                <div key={item.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        <span className="me-1.5 text-xs text-slate-400">{i + 1}.</span>
                        <bdi>{item.name}</bdi>
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.quantity} {item.unit}
                      </p>
                    </div>
                    <div className="flex items-end gap-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder={t("unitPrice")}
                        aria-label={t("unitPriceFor", { item: item.name })}
                        className="w-28"
                        value={prices[item.id] ?? ""}
                        onChange={(e) =>
                          setPrices((p) => ({
                            ...p,
                            [item.id]: sanitizeDecimalInput(e.target.value),
                          }))
                        }
                      />
                      <p className="w-20 pb-1.5 text-end text-xs font-medium text-slate-500">
                        {lineTotal === null ? "—" : formatMoney(lineTotal, currency, locale)}
                      </p>
                    </div>
                  </div>
                  <Input
                    placeholder={t("itemNote")}
                    aria-label={t("itemNote")}
                    className="mt-2 h-8 text-xs"
                    value={itemNotes[item.id] ?? ""}
                    onChange={(e) =>
                      setItemNotes((n) => ({ ...n, [item.id]: e.target.value }))
                    }
                  />
                </div>
              );
            })}
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-xs font-medium text-slate-600">{tv("subtotal")}</span>
              <span className="text-sm font-bold tracking-tight">{formatMoney(total, currency, locale)}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="manual-delivery" className="text-xs">
                {tf("delivery")}
              </Label>
              <Input
                id="manual-delivery"
                type="text"
                inputMode="numeric"
                placeholder={tf("deliveryPlaceholder")}
                value={deliveryDays}
                onChange={(e) => setDeliveryDays(sanitizeIntegerInput(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-payment" className="text-xs">
                {tf("payment")}
              </Label>
              <Input
                id="manual-payment"
                placeholder={tf("paymentPlaceholder")}
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="manual-warranty" className="text-xs">
                {tf("warranty")}
              </Label>
              <Input
                id="manual-warranty"
                placeholder={tf("warrantyPlaceholder")}
                value={warranty}
                onChange={(e) => setWarranty(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="manual-notes" className="text-xs">
                {tf("notes")}
              </Label>
              <Textarea
                id="manual-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isPending || suppliers.length === 0}
              className="gap-2"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {t("add")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
