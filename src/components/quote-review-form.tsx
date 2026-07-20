"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { confirmQuote, rejectQuote } from "@/app/(dashboard)/rfqs/quote-actions";
import { formatMoney } from "@/lib/format";
import { sanitizeDecimalInput, sanitizeIntegerInput } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

export interface ReviewItem {
  rfq_item_id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price: number | null;
  notes: string | null;
}

const CONFIDENCE_STYLES: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-red-50 text-red-600",
};

export function QuoteReviewForm({
  quoteId,
  rfqId,
  currency,
  supplierLabel,
  items,
  deliveryDays: initialDelivery,
  paymentTerms: initialPayment,
  warranty: initialWarranty,
  notes: initialNotes,
  confidence,
  warnings,
  pdfUrl,
}: {
  quoteId: string;
  rfqId: string;
  currency: string;
  supplierLabel: string;
  items: ReviewItem[];
  deliveryDays: number | null;
  paymentTerms: string | null;
  warranty: string | null;
  notes: string | null;
  confidence: string | null;
  warnings: string[];
  pdfUrl: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.map((i) => [i.rfq_item_id, i.unit_price === null ? "" : String(i.unit_price)])
    )
  );
  const [itemNotes, setItemNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((i) => [i.rfq_item_id, i.notes ?? ""]))
  );
  const [deliveryDays, setDeliveryDays] = useState(
    initialDelivery === null ? "" : String(initialDelivery)
  );
  const [paymentTerms, setPaymentTerms] = useState(initialPayment ?? "");
  const [warranty, setWarranty] = useState(initialWarranty ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");

  const total = useMemo(
    () =>
      items.reduce((sum, item) => {
        const price = parseFloat(prices[item.rfq_item_id] ?? "");
        return sum + (isNaN(price) ? 0 : price * item.quantity);
      }, 0),
    [items, prices]
  );

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await confirmQuote(quoteId, {
        items: items.map((item) => {
          const v = parseFloat(prices[item.rfq_item_id] ?? "");
          return {
            rfq_item_id: item.rfq_item_id,
            unit_price: isNaN(v) ? null : v,
            notes: itemNotes[item.rfq_item_id] || "",
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
        toast.success("Quote confirmed — it now appears in the comparison.");
        router.push(`/rfqs/${rfqId}`);
      }
    });
  }

  function handleReject() {
    startTransition(async () => {
      const result = await rejectQuote(quoteId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Quote rejected.");
        router.push(`/rfqs/${rfqId}`);
      }
    });
  }

  return (
    <form onSubmit={handleConfirm} className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {confidence && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
              CONFIDENCE_STYLES[confidence] ?? "bg-slate-100 text-slate-600"
            }`}
          >
            Extraction confidence: {confidence}
          </span>
        )}
        {pdfUrl && (
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={13} />
              Open original PDF
            </a>
          </Button>
        )}
      </div>

      {warnings.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <AlertTriangle className="h-4 w-4 !text-amber-600" />
          <AlertTitle>Check these before confirming</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            Extracted prices ({currency})
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Values extracted from {supplierLabel}&apos;s PDF. Correct anything
            that doesn&apos;t match the document.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((item, i) => {
            const price = parseFloat(prices[item.rfq_item_id] ?? "");
            const lineTotal = isNaN(price) ? null : price * item.quantity;
            const missing = prices[item.rfq_item_id] === "";
            return (
              <div
                key={item.rfq_item_id}
                className={`rounded-xl border p-4 ${
                  missing ? "border-amber-200 bg-amber-50/40" : "border-slate-100"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">
                      <span className="mr-2 text-xs text-slate-400">{i + 1}.</span>
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
                    {missing && (
                      <p className="mt-1 text-xs font-medium text-amber-600">
                        No price found in the PDF
                      </p>
                    )}
                  </div>
                  <div className="flex items-end gap-3">
                    <div>
                      <Label
                        htmlFor={`price-${item.rfq_item_id}`}
                        className="text-xs text-slate-500"
                      >
                        Unit price
                      </Label>
                      <Input
                        id={`price-${item.rfq_item_id}`}
                        type="text"
                        inputMode="decimal"
                        className="mt-1 w-32"
                        value={prices[item.rfq_item_id] ?? ""}
                        onChange={(e) =>
                          setPrices((p) => ({
                            ...p,
                            [item.rfq_item_id]: sanitizeDecimalInput(e.target.value),
                          }))
                        }
                      />
                    </div>
                    <div className="pb-2 text-right">
                      <p className="text-xs text-slate-400">Line total</p>
                      <p className="w-24 text-sm font-semibold">
                        {lineTotal === null ? "—" : formatMoney(lineTotal, currency)}
                      </p>
                    </div>
                  </div>
                </div>
                <Input
                  placeholder="Item note (alternatives, brand quoted, lead time)"
                  className="mt-3"
                  value={itemNotes[item.rfq_item_id] ?? ""}
                  onChange={(e) =>
                    setItemNotes((n) => ({
                      ...n,
                      [item.rfq_item_id]: e.target.value,
                    }))
                  }
                />
              </div>
            );
          })}

          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-slate-600">Quote total</span>
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
              value={deliveryDays}
              onChange={(e) => setDeliveryDays(sanitizeIntegerInput(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment">Payment terms</Label>
            <Input
              id="payment"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="warranty">Warranty</Label>
            <Input
              id="warranty"
              value={warranty}
              onChange={(e) => setWarranty(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={handleReject}
          className="gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <XCircle className="h-4 w-4" />
          Reject quote
        </Button>
        <Button type="submit" disabled={isPending} className="gap-2">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Confirm quote
        </Button>
      </div>
    </form>
  );
}
