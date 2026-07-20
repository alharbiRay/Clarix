"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PenLine } from "lucide-react";
import { toast } from "sonner";
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
      toast.error("Choose which supplier this quote is for");
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
        toast.success("Quote added — it's included in the comparison.");
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
          <PenLine size={14} />
          Add supplier quote
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a supplier quote manually</DialogTitle>
          <DialogDescription>
            For quotes that came in by phone or email — enter the prices
            directly, no PDF needed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Who is this quote from?" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suppliers.length === 0 && (
              <p className="text-xs text-slate-400">
                Every supplier on this RFQ already has a quote.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-xs text-slate-500">
              Prices ({currency})
            </Label>
            {items.map((item, i) => {
              const price = parseFloat(prices[item.id] ?? "");
              const lineTotal = isNaN(price) ? null : price * item.quantity;
              return (
                <div key={item.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        <span className="mr-1.5 text-xs text-slate-400">{i + 1}.</span>
                        {item.name}
                      </p>
                      <p className="text-xs text-slate-400">
                        {item.quantity} {item.unit}
                      </p>
                    </div>
                    <div className="flex items-end gap-2">
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="Unit price"
                        className="w-28"
                        value={prices[item.id] ?? ""}
                        onChange={(e) =>
                          setPrices((p) => ({
                            ...p,
                            [item.id]: sanitizeDecimalInput(e.target.value),
                          }))
                        }
                      />
                      <p className="w-20 pb-1.5 text-right text-xs font-medium text-slate-500">
                        {lineTotal === null ? "—" : formatMoney(lineTotal, currency)}
                      </p>
                    </div>
                  </div>
                  <Input
                    placeholder="Optional note for this item"
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
              <span className="text-xs font-medium text-slate-600">Quote total</span>
              <span className="text-sm font-bold tracking-tight">
                {formatMoney(total, currency)}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="manual-delivery" className="text-xs">
                Delivery time (days)
              </Label>
              <Input
                id="manual-delivery"
                type="text"
                inputMode="numeric"
                placeholder="e.g. 14"
                value={deliveryDays}
                onChange={(e) => setDeliveryDays(sanitizeIntegerInput(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-payment" className="text-xs">
                Payment terms
              </Label>
              <Input
                id="manual-payment"
                placeholder="e.g. Net 30"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="manual-warranty" className="text-xs">
                Warranty
              </Label>
              <Input
                id="manual-warranty"
                placeholder="e.g. 2 years parts and labor"
                value={warranty}
                onChange={(e) => setWarranty(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="manual-notes" className="text-xs">
                Notes
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
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Add quote
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
