"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { submitQuote } from "@/app/quote/[token]/actions";
import { formatMoney } from "@/lib/format";
import { sanitizeDecimalInput, sanitizeIntegerInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface QuoteFormItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
}

export function SupplierQuoteForm({
  token,
  currency,
  items,
}: {
  token: string;
  currency: string;
  items: QuoteFormItem[];
}) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [deliveryDays, setDeliveryDays] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [warranty, setWarranty] = useState("");
  const [notes, setNotes] = useState("");

  const total = useMemo(
    () =>
      items.reduce((sum, item) => {
        const price = parseFloat(prices[item.id] ?? "");
        return sum + (isNaN(price) ? 0 : price * item.quantity);
      }, 0),
    [items, prices]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const missingPrices = items.filter((item) => {
      const v = parseFloat(prices[item.id] ?? "");
      return isNaN(v) || v < 0;
    });
    if (missingPrices.length > 0) {
      toast.error(`Enter a price for "${missingPrices[0].name}"`);
      return;
    }

    startTransition(async () => {
      const result = await submitQuote(token, {
        items: items.map((item) => ({
          rfq_item_id: item.id,
          unit_price: parseFloat(prices[item.id]),
          notes: itemNotes[item.id] || "",
        })),
        delivery_days: deliveryDays ? parseInt(deliveryDays, 10) : null,
        payment_terms: paymentTerms,
        warranty,
        notes,
      });
      if (result?.error) {
        toast.error(result.error);
      } else {
        setSubmitted(true);
      }
    });
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
          <CheckCircle2 size={22} className="text-emerald-600" />
        </div>
        <h2 className="text-lg font-bold tracking-tight">Quote submitted</h2>
        <p className="mt-2 text-sm text-slate-500">
          Thank you — the buyer has received your quote and will be in touch.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Your prices ({currency})
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Enter a unit price for each line item.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, i) => {
            const price = parseFloat(prices[item.id] ?? "");
            const lineTotal = isNaN(price) ? null : price * item.quantity;
            return (
              <div
                key={item.id}
                className="rounded-xl border border-slate-100 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">
                      <span className="mr-2 text-xs text-slate-400">
                        {i + 1}.
                      </span>
                      {item.name}
                    </p>
                    {item.description && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        {item.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Quantity: {item.quantity} {item.unit}
                    </p>
                  </div>
                  <div className="flex items-end gap-3">
                    <div>
                      <Label
                        htmlFor={`price-${item.id}`}
                        className="text-xs text-slate-500"
                      >
                        Unit price *
                      </Label>
                      <Input
                        id={`price-${item.id}`}
                        type="text"
                        inputMode="decimal"
                        required
                        className="mt-1 w-32"
                        value={prices[item.id] ?? ""}
                        onChange={(e) =>
                          setPrices((p) => ({
                            ...p,
                            [item.id]: sanitizeDecimalInput(e.target.value),
                          }))
                        }
                      />
                    </div>
                    <div className="pb-2 text-right">
                      <p className="text-xs text-slate-400">Line total</p>
                      <p className="w-24 text-sm font-semibold">
                        {lineTotal === null
                          ? "—"
                          : formatMoney(lineTotal, currency)}
                      </p>
                    </div>
                  </div>
                </div>
                <Input
                  placeholder="Optional note for this item (alternatives, lead time, etc.)"
                  className="mt-3"
                  value={itemNotes[item.id] ?? ""}
                  onChange={(e) =>
                    setItemNotes((n) => ({ ...n, [item.id]: e.target.value }))
                  }
                />
              </div>
            );
          })}

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-slate-600">
              Quote total
            </span>
            <span className="text-lg font-bold tracking-tight">
              {formatMoney(total, currency)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Terms</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="delivery">Delivery time (days)</Label>
            <Input
              id="delivery"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 14"
              value={deliveryDays}
              onChange={(e) => setDeliveryDays(sanitizeIntegerInput(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment">Payment terms</Label>
            <Input
              id="payment"
              placeholder="e.g. Net 30, 50% advance"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="warranty">Warranty</Label>
            <Input
              id="warranty"
              placeholder="e.g. 2 years parts and labor"
              value={warranty}
              onChange={(e) => setWarranty(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              placeholder="Anything else the buyer should know."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending} className="gap-2">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          Submit quote
        </Button>
      </div>
    </form>
  );
}
